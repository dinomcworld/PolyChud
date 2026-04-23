import {
  ActivityType,
  Client,
  Collection,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { betCommand } from "./commands/bet.js";
// Import commands
import { dailyCommand } from "./commands/daily.js";
import { helpCommand } from "./commands/help.js";
import { leaderboardCommand } from "./commands/leaderboard.js";
import { marketCommand } from "./commands/market.js";
import { portfolioCommand } from "./commands/portfolio.js";
import type { Command } from "./commands/types.js";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
// Import interaction handlers
import { handleButton } from "./interactions/buttons.js";
import { handleModal } from "./interactions/modals.js";
import { handleSelectMenu } from "./interactions/selects.js";
import { startPoller, stopPoller } from "./jobs/poller.js";
// Import jobs
import { startResolver, stopResolver } from "./jobs/resolver.js";
import { consumeNewSettlements } from "./services/betting.js";
import {
  getCachedMarket,
  getMarketByConditionId,
} from "./services/polymarket.js";
import { escapeMarkdown } from "./ui/marketCard.js";
import { logger } from "./utils/logger.js";

// Build command collection
const commands = new Collection<string, Command>();
const commandList: Command[] = [
  dailyCommand,
  portfolioCommand,
  helpCommand,
  marketCommand,
  betCommand,
  leaderboardCommand,
];
for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

// Create client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Ready
client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Bot online as ${readyClient.user.tag}`);

  readyClient.user.setPresence({
    activities: [{ name: "Nothing Ever Happens", type: ActivityType.Watching }],
    status: "online",
  });

  // Start background jobs after bot is ready
  startResolver();
  void startPoller();
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }
      const sub = interaction.options.getSubcommand(false);
      logger.debug(
        `command: user=${interaction.user.id} guild=${interaction.guildId ?? "dm"} /${interaction.commandName}${sub ? ` ${sub}` : ""}`,
      );
      await command.execute(interaction);
      await maybeNotifySettlements(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    logger.error("Interaction handler error:", error);
    const reply = {
      content: "Something went wrong. Please try again.",
      flags: MessageFlags.Ephemeral as const,
    };
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    } catch {
      // Can't respond, interaction likely expired
    }
  }
});

/**
 * Pull-on-interact: after a slash command, check whether any of the user's
 * bets have been auto-settled (won/lost/cancelled) since we last told them,
 * and if so, post a public followUp card listing them. Self-closed bets
 * (closed_early) are excluded — the user already saw the close card.
 */
async function maybeNotifySettlements(
  interaction: import("discord.js").ChatInputCommandInteraction,
) {
  if (!interaction.guildId) return;

  try {
    const result = await consumeNewSettlements(
      interaction.user.id,
      interaction.guildId,
    );
    if (result.count === 0) return;

    const sign = result.netPts >= 0 ? "+" : "";
    const color = result.netPts >= 0 ? 0x00cc66 : 0xff4444;

    const entries = result.settlements.map((s) => {
      const statusLabel =
        s.status === "won"
          ? "WON"
          : s.status === "lost"
            ? "LOST"
            : s.status === "cancelled"
              ? "REFUNDED"
              : s.status.toUpperCase();
      const pnl = s.actualPayout - s.amount;
      const pnlStr =
        pnl >= 0 ? `+${pnl.toLocaleString()}` : pnl.toLocaleString();
      const trimmed =
        s.marketQuestion.length > 120
          ? `${s.marketQuestion.slice(0, 117)}...`
          : s.marketQuestion;
      const marketTitle = escapeMarkdown(trimmed);
      const marketLine = s.eventSlug
        ? `[${marketTitle}](https://polymarket.com/event/${s.eventSlug})`
        : marketTitle;
      return [
        `**${marketLine}**`,
        `#${s.betId} — ${s.outcome.toUpperCase()} · ${statusLabel} · Stake **${s.amount.toLocaleString()}** → **${s.actualPayout.toLocaleString()}** pts (**${pnlStr}**)`,
      ].join("\n");
    });

    const MAX_DESC = 3800;
    const descLines: string[] = [];
    let used = 0;
    let shown = 0;
    for (const e of entries) {
      const addLen = e.length + (descLines.length > 0 ? 2 : 0);
      if (used + addLen > MAX_DESC) break;
      descLines.push(e);
      used += addLen;
      shown++;
    }
    const remaining = entries.length - shown;
    if (remaining > 0) {
      descLines.push(`_…and ${remaining} more_`);
    }

    const title =
      result.count === 1 ? "Bet Settled" : `${result.count} Bets Settled`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setAuthor({
        name: interaction.user.displayName,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setDescription(descLines.join("\n\n"))
      .setFooter({ text: `Net ${sign}${result.netPts.toLocaleString()} pts` })
      .setTimestamp();

    const first = result.settlements[0];
    if (first?.marketConditionId) {
      try {
        const gamma =
          getCachedMarket(first.marketConditionId) ||
          (await getMarketByConditionId(first.marketConditionId));
        const image = gamma?.image || gamma?.icon;
        if (image) embed.setThumbnail(image);
      } catch (err) {
        logger.warn("Failed to attach thumbnail to settlement card", { err });
      }
    }

    await interaction.followUp({ embeds: [embed] });
  } catch (err) {
    logger.error("settlement notice failed:", err);
  }
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);

  // Stop background jobs
  stopResolver();
  stopPoller();

  // Destroy Discord client
  client.destroy();
  logger.info("Discord client destroyed");

  // Give in-flight DB operations a moment to complete
  await new Promise((r) => setTimeout(r, 2000));

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Run migrations then start
await runMigrations();
client.login(config.DISCORD_TOKEN);

CREATE TABLE "guild_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"points_balance" integer DEFAULT 1000 NOT NULL,
	"accumulated_pct" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"total_bets_settled" integer DEFAULT 0 NOT NULL,
	"total_won" integer DEFAULT 0 NOT NULL,
	"total_lost" integer DEFAULT 0 NOT NULL,
	"last_daily_claim" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_guild_members_user_guild" ON "guild_members" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "idx_guild_members_guild_id" ON "guild_members" USING btree ("guild_id");--> statement-breakpoint
-- Backfill guild_members from existing users × (distinct guilds from their bets)
INSERT INTO "guild_members" (
  "user_id", "guild_id", "points_balance", "accumulated_pct",
  "total_bets_settled", "total_won", "total_lost", "last_daily_claim"
)
SELECT
  u.id,
  b.guild_id,
  u.points_balance,
  u.accumulated_pct,
  u.total_bets_settled,
  u.total_won,
  u.total_lost,
  u.last_daily_claim
FROM "users" u
JOIN (SELECT DISTINCT user_id, guild_id FROM "bets") b ON b.user_id = u.id
ON CONFLICT ("user_id", "guild_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "points_balance";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "accumulated_pct";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "total_bets_settled";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "total_won";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "total_lost";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "last_daily_claim";
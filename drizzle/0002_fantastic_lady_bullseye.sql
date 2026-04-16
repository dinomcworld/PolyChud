DROP INDEX "idx_events_end_date";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "end_date";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "neg_risk";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "market_count";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "last_polled_at";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "outcome_label";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "resolved_outcome";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "volume_24h";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "one_hour_price_change";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "one_day_price_change";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "last_polled_at";
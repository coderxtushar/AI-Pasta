ALTER TABLE "comparison" ADD COLUMN "followUps" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "response" ADD COLUMN "turn" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "response" DROP CONSTRAINT "response_comparisonId_modelId_pk";--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_comparisonId_modelId_turn_pk" PRIMARY KEY("comparisonId","modelId","turn");

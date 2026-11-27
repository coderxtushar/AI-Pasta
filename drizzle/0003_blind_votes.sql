CREATE TABLE "vote" (
	"comparisonId" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"winnerModelId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comparison" ADD COLUMN "blind" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_comparisonId_comparison_id_fk" FOREIGN KEY ("comparisonId") REFERENCES "public"."comparison"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vote_user_idx" ON "vote" USING btree ("userId");
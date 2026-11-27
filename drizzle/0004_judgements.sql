CREATE TABLE "judgement" (
	"comparisonId" text NOT NULL,
	"judgeModelId" text NOT NULL,
	"verdict" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgement_comparisonId_judgeModelId_pk" PRIMARY KEY("comparisonId","judgeModelId")
);
--> statement-breakpoint
ALTER TABLE "judgement" ADD CONSTRAINT "judgement_comparisonId_comparison_id_fk" FOREIGN KEY ("comparisonId") REFERENCES "public"."comparison"("id") ON DELETE cascade ON UPDATE no action;
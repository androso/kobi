DO $$ BEGIN
 CREATE TYPE "public"."session_activity_candidate_status" AS ENUM('ready', 'approved', 'rejected', 'superseded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."activity_status" AS ENUM('candidate', 'verified', 'rejected', 'superseded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."activity_source" ADD VALUE IF NOT EXISTS 'seeded';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_bundles" (
	"ref" text PRIMARY KEY NOT NULL,
	"index_html" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "contract_version" text DEFAULT 'activity-artifact/v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "status" "activity_status" DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "curriculum_tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "activities" SET "verifier_scores" = '{}'::jsonb WHERE "verifier_scores" IS NULL;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "verifier_scores" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "verifier_scores" SET NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_activity_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"difficulty_band" "band" NOT NULL,
	"status" "session_activity_candidate_status" DEFAULT 'ready' NOT NULL,
	"source" "activity_source" NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verifier_scores" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_activity_candidates" ADD CONSTRAINT "session_activity_candidates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_activity_candidates" ADD CONSTRAINT "session_activity_candidates_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "session_id" uuid;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "candidate_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_candidate_id_session_activity_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."session_activity_candidates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_status_idx" ON "activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_activity_candidates_latest_idx" ON "session_activity_candidates" USING btree ("session_id","difficulty_band","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_session_student_idx" ON "assignments" USING btree ("session_id","student_id");

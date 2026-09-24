CREATE TABLE "endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"method" varchar(16) NOT NULL,
	"path" varchar(1024) NOT NULL,
	"operation_id" varchar(255),
	"auth_type" varchar(64) DEFAULT 'none' NOT NULL,
	"parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_schema" jsonb,
	"response_schema" jsonb,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_url" varchar(1024) NOT NULL,
	"spec_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"category" varchar(32) NOT NULL,
	"test_name" varchar(128) NOT NULL,
	"status" varchar(16) NOT NULL,
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"latency_ms" integer,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"total_tests" integer DEFAULT 0 NOT NULL,
	"completed_tests" integer DEFAULT 0 NOT NULL,
	"passed_tests" integer DEFAULT 0 NOT NULL,
	"failed_tests" integer DEFAULT 0 NOT NULL,
	"warning_tests" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_endpoints_target" ON "endpoints" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_endpoints_target_method_path" ON "endpoints" USING btree ("target_id","method","path");--> statement-breakpoint
CREATE INDEX "idx_test_results_run" ON "test_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_test_results_endpoint" ON "test_results" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "idx_test_results_run_category" ON "test_results" USING btree ("run_id","category");--> statement-breakpoint
CREATE INDEX "idx_test_runs_target" ON "test_runs" USING btree ("target_id");
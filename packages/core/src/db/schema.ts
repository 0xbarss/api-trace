import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

export interface EndpointParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema?: Record<string, unknown>;
}

export interface TestResultDetail {
  evidence: string;
  requestSent?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  responseReceived?: {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
  remediation?: string;
}

export const targets = pgTable("targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: varchar("base_url", { length: 1024 }).notNull(),
  specSource: text("spec_source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetId: uuid("target_id")
      .references(() => targets.id, { onDelete: "cascade" })
      .notNull(),
    method: varchar("method", { length: 16 }).notNull(),
    path: varchar("path", { length: 1024 }).notNull(),
    operationId: varchar("operation_id", { length: 255 }),
    authType: varchar("auth_type", { length: 64 }).default("none").notNull(),
    parameters: jsonb("parameters").$type<EndpointParameter[]>().default([]).notNull(),
    requestSchema: jsonb("request_schema").$type<Record<string, unknown> | null>(),
    responseSchema: jsonb("response_schema").$type<Record<string, unknown> | null>(),
    riskScore: integer("risk_score").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_endpoints_target").on(table.targetId),
    index("idx_endpoints_target_method_path").on(table.targetId, table.method, table.path),
  ]
);

export const testRuns = pgTable(
  "test_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetId: uuid("target_id")
      .references(() => targets.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 32 }).default("pending").notNull(),
    totalTests: integer("total_tests").default(0).notNull(),
    completedTests: integer("completed_tests").default(0).notNull(),
    passedTests: integer("passed_tests").default(0).notNull(),
    failedTests: integer("failed_tests").default(0).notNull(),
    warningTests: integer("warning_tests").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_test_runs_target").on(table.targetId),
  ]
);

export const testResults = pgTable(
  "test_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .references(() => testRuns.id, { onDelete: "cascade" })
      .notNull(),
    endpointId: uuid("endpoint_id")
      .references(() => endpoints.id, { onDelete: "cascade" })
      .notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    testName: varchar("test_name", { length: 128 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    severity: varchar("severity", { length: 16 }).default("info").notNull(),
    latencyMs: integer("latency_ms"),
    detail: jsonb("detail").$type<TestResultDetail>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_test_results_run").on(table.runId),
    index("idx_test_results_endpoint").on(table.endpointId),
    index("idx_test_results_run_category").on(table.runId, table.category),
  ]
);

export const targetsRelations = relations(targets, ({ many }) => ({
  endpoints: many(endpoints),
  testRuns: many(testRuns),
}));

export const endpointsRelations = relations(endpoints, ({ one, many }) => ({
  target: one(targets, {
    fields: [endpoints.targetId],
    references: [targets.id],
  }),
  testResults: many(testResults),
}));

export const testRunsRelations = relations(testRuns, ({ one, many }) => ({
  target: one(targets, {
    fields: [testRuns.targetId],
    references: [targets.id],
  }),
  testResults: many(testResults),
}));

export const testResultsRelations = relations(testResults, ({ one }) => ({
  testRun: one(testRuns, {
    fields: [testResults.runId],
    references: [testRuns.id],
  }),
  endpoint: one(endpoints, {
    fields: [testResults.endpointId],
    references: [endpoints.id],
  }),
}));

export type Target = InferSelectModel<typeof targets>;
export type NewTarget = InferInsertModel<typeof targets>;

export type Endpoint = InferSelectModel<typeof endpoints>;
export type NewEndpoint = InferInsertModel<typeof endpoints>;

export type TestRun = InferSelectModel<typeof testRuns>;
export type NewTestRun = InferInsertModel<typeof testRuns>;

export type TestResult = InferSelectModel<typeof testResults>;
export type NewTestResult = InferInsertModel<typeof testResults>;

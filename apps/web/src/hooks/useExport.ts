import type { TestFinding } from "../types.js";

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_COLUMNS = [
  "id",
  "status",
  "severity",
  "category",
  "testName",
  "method",
  "url",
  "evidence",
  "remediation",
  "latencyMs",
  "createdAt",
] as const;

function findingToCsvRow(f: TestFinding): string {
  const fields: unknown[] = [
    f.id,
    f.status,
    f.severity,
    f.category,
    f.testName,
    f.detail.requestSent?.method ?? "",
    f.detail.requestSent?.url ?? "",
    f.detail.evidence,
    f.detail.remediation ?? "",
    f.latencyMs ?? "",
    f.createdAt,
  ];
  return fields.map(escapeCsvField).join(",");
}

export function useExport(findings: TestFinding[], runId: string | null) {
  const prefix = runId ? runId.slice(0, 8) : "export";

  function exportJson(): void {
    const content = JSON.stringify(findings, null, 2);
    triggerDownload(content, `apitrace-${prefix}-findings.json`, "application/json");
  }

  function exportCsv(): void {
    const header = CSV_COLUMNS.join(",");
    const rows = findings.map(findingToCsvRow);
    const content = [header, ...rows].join("\n");
    triggerDownload(content, `apitrace-${prefix}-findings.csv`, "text/csv");
  }

  return { exportJson, exportCsv };
}

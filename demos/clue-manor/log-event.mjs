#!/usr/bin/env node
// log-event.mjs -- safe append to a Clue Manor run's events.jsonl.
//
// usage: node log-event.mjs <run-dir> <kind> <type> <from> <to> <status> <text> [quote]
//
// Handles JSON escaping so the game master never has to; a malformed
// hand-written line degrades the report silently, a helper never does.
// Timestamps are added here (ISO-8601, UTC).

import { appendFileSync } from "node:fs";
import { join } from "node:path";

const [runDir, kind, type, from, to, status, text, quote] = process.argv.slice(2);
if (!runDir || !kind || !from || !text) {
  console.error("usage: node log-event.mjs <run-dir> <kind> <type> <from> <to> <status> <text> [quote]");
  process.exit(2);
}

const event = { ts: new Date().toISOString(), kind, type, from, to: to || "n/a", status: status || "n/a", text };
if (quote) event.quote = quote;

appendFileSync(join(runDir, "events.jsonl"), JSON.stringify(event) + "\n");
console.log(`logged: ${type ?? kind} ${from} -> ${event.to}`);

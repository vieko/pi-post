#!/usr/bin/env node
// render-report.mjs -- deterministic case-report renderer for Clue Manor.
//
// usage: node render-report.mjs <run-dir>
//
// Reads <run-dir>/events.jsonl (one JSON object per line) and
// <run-dir>/manifest.tsv (written by summon.sh), writes
// <run-dir>/report.html: a single self-contained file, no external
// assets, no JS. The Ghost appends events during play; this script is
// the single source of the artifact, so the report is reproducible from
// the log rather than hand-written.
//
// Event schema:
//   { ts: ISO-8601, kind: "message"|"milestone", type?: string,
//     from: string, to: string, status: "delivered"|"queued"|"n/a",
//     text: string, quote?: string }
//
// `quote` is an optional verbatim excerpt (the strongest one or two
// sentences of the actual message); it renders as a pull-quote with
// `text` as the caption beneath.
//
// Recognized type values get emphasis: accuse, confess, verdict,
// gameover, summon, retire, dawn, whisper, queued, resume.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const runDir = process.argv[2];
if (!runDir) {
  console.error("usage: node render-report.mjs <run-dir>");
  process.exit(2);
}

const eventsPath = join(runDir, "events.jsonl");
if (!existsSync(eventsPath)) {
  console.error(`error: ${eventsPath} not found`);
  process.exit(1);
}

const events = readFileSync(eventsPath, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      console.error(`warn: skipping malformed line ${i + 1}`);
      return null;
    }
  })
  .filter(Boolean);

let manifest = [];
const manifestPath = join(runDir, "manifest.tsv");
if (existsSync(manifestPath)) {
  manifest = readFileSync(manifestPath, "utf8")
    .split("\n")
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const [role, name, window, pane] = l.split("\t");
      return { role, name, window, pane };
    });
}

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const ROLE_KEYS = ["ghost", "scarlett", "mustard", "peacock", "plum", "green", "white", "human", "process"];
const roleOf = (name) => {
  const n = String(name ?? "").toLowerCase();
  for (const k of ROLE_KEYS) if (n.includes(k)) return k;
  if (n.includes("dawn") || n.includes("timer") || n.includes("cli")) return "process";
  return "other";
};
const hhmm = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// -- Stats ----------------------------------------------------------------
const msgs = events.filter((e) => e.kind === "message");
const ghostOut = msgs.filter((e) => roleOf(e.from) === "ghost").length;
const ghostIn = msgs.filter((e) => roleOf(e.to) === "ghost").length;
const peer = msgs.length - ghostOut - ghostIn;
const queued = msgs.filter((e) => e.status === "queued").length;
const delivered = msgs.filter((e) => e.status === "delivered").length;

// -- Verdict / outcome ----------------------------------------------------
const verdictEv = [...events].reverse().find((e) => (e.type ?? "").toLowerCase() === "verdict");
const overEv = [...events].reverse().find((e) => (e.type ?? "").toLowerCase() === "gameover");
const verdictText = verdictEv?.text ?? overEv?.text ?? "The case remains open. The dead are patient.";

// -- Timeline -------------------------------------------------------------
const EMPHASIS = new Set(["accuse", "confess", "verdict", "gameover", "summon", "retire", "dawn", "queued", "resume"]);

// Acts: forward-only chapter headers derived from event types. An event
// whose trigger maps to an earlier act never regresses the narrative.
const ACTS = [
  { title: "The Summoning", types: ["summon"] },
  { title: "The Investigation", types: ["q", "clue", "relay", "reveal"] },
  { title: "The Whisper Hour", types: ["whisper"] },
  { title: "The Night", types: ["retire", "goodnight", "queued", "resume"] },
  { title: "Dawn", types: ["dawn"] },
  { title: "The Accusations", types: ["accuse"] },
  { title: "The Verdict", types: ["verdict"] },
  { title: "Epilogue", types: ["confess", "farewell", "gameover"] },
];
const actIndex = (type) => ACTS.findIndex((a) => a.types.includes(type));

let currentAct = -1;
const chunks = [];
for (const e of events) {
  const role = roleOf(e.from);
  const type = (e.type ?? "").toLowerCase();
  const target = actIndex(type);
  if (target > currentAct) {
    if (currentAct >= 0) chunks.push("</ol>");
    chunks.push(`<h3 class="act">${esc(ACTS[target].title)}</h3>`, '<ol class="timeline">');
    currentAct = target;
  } else if (currentAct === -1) {
    chunks.push('<ol class="timeline">');
    currentAct = 0;
  }
  const emphatic = e.kind === "milestone" || EMPHASIS.has(type);
  const cls = [`from-${role}`, emphatic ? "milestone" : ""].filter(Boolean).join(" ");
  const arrow = e.kind === "message" ? ` &rarr; ${esc(e.to)}` : "";
  const status = e.status && e.status !== "n/a" ? ` &middot; ${esc(e.status)}` : "";
  const tag = type ? ` &middot; ${esc(type.toUpperCase())}` : "";
  const quote = e.quote ? `<blockquote>${esc(e.quote)}</blockquote>` : "";
  const body = e.quote ? `<div class="caption">${esc(e.text)}</div>` : esc(e.text);
  chunks.push(
    `  <li class="${cls}"><div class="meta">${hhmm(e.ts)} &middot; <span class="name n-${role}">${esc(
      e.from
    )}</span>${arrow}${status}${tag}</div>${quote}${body}</li>`
  );
}
if (currentAct >= 0 || events.length) chunks.push("</ol>");
const timelineItems = chunks.join("\n");

// -- Cast -----------------------------------------------------------------
const castRows = manifest
  .map(
    (m) =>
      `  <tr><td class="name n-${roleOf(m.name)}">${esc(m.name)}</td><td><code>${esc(m.window)}</code></td><td><code>${esc(
        m.pane
      )}</code></td></tr>`
  )
  .join("\n");

const runName = runDir.replace(/\/+$/, "").split("/").pop();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Boddy Manor Affair — Case Report</title>
<style>
  :root {
    --bg: #14100e; --panel: #1e1815; --line: #3a2f28; --ink: #d8cfc4;
    --dim: #8a7d70; --gold: #c9a227; --blood: #a4423a;
    --scarlett: #d4585a; --mustard: #c9a227; --peacock: #4a8fa8;
    --plum: #9b6b9e; --green: #5e9c6f; --white: #b9b3ab;
    --ghost: #7fa87f; --human: #b0a08c; --process: #7a8ba8; --other: #8a7d70;
  }
  * { box-sizing: border-box; }
  html { font-size: 16px; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--ink);
    font: 1.0625rem/1.65 Georgia, 'Times New Roman', serif;
    text-rendering: optimizeLegibility; font-kerning: normal;
  }
  main { max-width: 70ch; margin: 0 auto; }
  p, li { text-wrap: pretty; orphans: 3; widows: 3; hyphens: auto; hyphenate-limit-chars: 8 4 4; }
  header { text-align: center; border-bottom: 3px double var(--line); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  h1 {
    font-variant: small-caps; letter-spacing: .1em; margin: 0 0 .35rem; color: var(--gold);
    font-size: clamp(1.7rem, 5vw, 2.3rem); line-height: 1.15; text-wrap: balance; font-weight: 600;
  }
  .subtitle { color: var(--dim); font-style: italic; font-size: .95rem; text-wrap: balance; }
  .verdict {
    background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--blood);
    padding: 1rem 1.25rem; margin: 1.5rem 0; font-size: 1.05rem; line-height: 1.6; text-wrap: pretty;
  }
  .verdict::before { content: "Verdict"; display: block; font-variant: small-caps; letter-spacing: .12em; color: var(--blood); font-size: .8rem; margin-bottom: .35rem; }
  h2 {
    font-variant: small-caps; letter-spacing: .1em; color: var(--gold); font-weight: 600;
    font-size: 1.2rem; line-height: 1.3; text-wrap: balance;
    border-bottom: 1px solid var(--line); padding-bottom: .3rem; margin: 2.75rem 0 1rem;
  }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .92rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--dim); font-weight: normal; font-variant: small-caps; letter-spacing: .08em; font-size: .82rem; }
  code { font-family: 'SF Mono', Menlo, monospace; font-size: .82em; color: var(--dim); }
  .timeline { list-style: none; padding: 0; margin: 0; }
  .timeline li {
    background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--other);
    margin: .6rem 0; padding: .7rem 1rem .75rem; border-radius: 2px; font-size: .95rem; line-height: 1.6;
  }
  .timeline .meta {
    font-size: .72rem; color: var(--dim); font-family: 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums; margin-bottom: .3rem; letter-spacing: .01em;
  }
  .timeline .milestone { border-left-color: var(--blood); background: #241a17; }
  .act {
    font-variant: small-caps; letter-spacing: .14em; color: var(--dim); font-weight: 600;
    font-size: .95rem; text-align: center; margin: 2.2rem 0 .9rem; text-wrap: balance;
  }
  .act::before, .act::after { content: "\\2014"; color: var(--line); margin: 0 .6em; }
  .timeline blockquote {
    margin: .1rem 0 .45rem; padding: 0; border: 0; font-style: italic;
    font-size: 1.02rem; line-height: 1.55; color: var(--ink); text-wrap: pretty;
  }
  .timeline blockquote::before { content: "\\201C"; color: var(--gold); }
  .timeline blockquote::after { content: "\\201D"; color: var(--gold); }
  .timeline .caption { font-size: .85rem; color: var(--dim); text-wrap: pretty; }
  .from-ghost { border-left-color: var(--ghost); }
  .from-scarlett { border-left-color: var(--scarlett); }
  .from-mustard { border-left-color: var(--mustard); }
  .from-peacock { border-left-color: var(--peacock); }
  .from-plum { border-left-color: var(--plum); }
  .from-green { border-left-color: var(--green); }
  .from-white { border-left-color: var(--white); }
  .from-human { border-left-color: var(--human); }
  .from-process { border-left-color: var(--process); }
  .name { font-variant: small-caps; letter-spacing: .05em; }
  .n-ghost { color: var(--ghost); } .n-scarlett { color: var(--scarlett); }
  .n-mustard { color: var(--mustard); } .n-peacock { color: var(--peacock); }
  .n-plum { color: var(--plum); } .n-green { color: var(--green); }
  .n-white { color: var(--white); } .n-human { color: var(--human); }
  .n-process { color: var(--process); } .n-other { color: var(--other); }
  .stats { display: flex; flex-wrap: wrap; gap: .8rem; margin: 1rem 0; }
  .stat { background: var(--panel); border: 1px solid var(--line); padding: .8rem 1rem; text-align: center; flex: 1 1 120px; }
  .stat .num { font-size: 1.7rem; color: var(--gold); display: block; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .stat .label { font-size: .74rem; color: var(--dim); font-variant: small-caps; letter-spacing: .08em; }
  footer { margin-top: 3rem; border-top: 3px double var(--line); padding-top: 1.2rem; color: var(--dim); font-size: .9rem; }
  footer em { color: var(--ink); }
  footer .colophon { margin-top: 1.5rem; text-align: center; font-style: italic; }
  @media print { body { background: #fff; color: #222; } }
</style>
</head>
<body>
<main>
<header>
  <h1>The Boddy Manor Affair</h1>
  <div class="subtitle">A case conducted entirely over pi-post &mdash; run ${esc(runName)}</div>
</header>

<div class="verdict">${esc(verdictText)}</div>

<h2>The Cast</h2>
<table>
  <tr><th>Session</th><th>Window</th><th>Pane</th></tr>
${castRows || '  <tr><td colspan="3">No manifest found.</td></tr>'}
</table>

<h2>Delivery Statistics</h2>
<div class="stats">
  <div class="stat"><span class="num">${msgs.length}</span><span class="label">messages</span></div>
  <div class="stat"><span class="num">${ghostOut}</span><span class="label">ghost &rarr; guests</span></div>
  <div class="stat"><span class="num">${ghostIn}</span><span class="label">guests &rarr; ghost</span></div>
  <div class="stat"><span class="num">${peer}</span><span class="label">whispers / process</span></div>
  <div class="stat"><span class="num">${delivered}</span><span class="label">delivered</span></div>
  <div class="stat"><span class="num">${queued}</span><span class="label">queued</span></div>
</div>

<h2>Timeline of Events</h2>
${timelineItems}

<h2>What pi-post Did</h2>
<footer>
  <p><em>Wake-on-idle delivery:</em> every clue started an idle suspect's next turn &mdash; no polling,
  no "check your messages." The suspects' briefs were their first turns; the Ghost's replies were
  every turn after.</p>
  <p><em>Named sessions:</em> each suspect was summoned with <code>pi --name</code>, so every delivery
  header read <span class="name">miss-scarlett</span>, not N indistinguishable
  <code>&lt;dir&gt;-&lt;addr4&gt;</code> defaults from one run directory.</p>
  <p><em>The queue:</em> a retired suspect's session was closed mid-game; a clue sent to it reported
  <code>queued</code> and landed as the session's first turn on resume &mdash; the address names the
  conversation, not the process.</p>
  <p><em>Process senders:</em> dawn arrived by <code>pi-post send</code> from a plain shell timer, not
  from any pi session &mdash; anything that can run a command can message a session.</p>
  <p><em>Peer-to-peer:</em> whisper hour resolved fellow guests by session name, no hub required.</p>
  <p><em>The authority boundary:</em> every message arrived labeled as carrying no authority. The
  suspects lied, framed each other, and demanded things all night, and none of it could compel
  anything. The game only works because the channel is untrusted by design.</p>
  <p class="colophon">Mr. Boddy rests. The '87 is spoken for.</p>
</footer>
</main>
</body>
</html>
`;

const outPath = join(runDir, "report.html");
writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${events.length} events, ${msgs.length} messages)`);

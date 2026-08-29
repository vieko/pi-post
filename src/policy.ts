import type { Message } from "./message.ts";

export type InboundMode = "accept" | "ask" | "refuse";

export function inboundMode(env: NodeJS.ProcessEnv = process.env): InboundMode {
  const value = env.PI_POST_INBOUND;
  if (value === "ask" || value === "refuse") return value;
  return "accept";
}

export type ResumeMode = "wake" | "stage";

/**
 * What happens to mail queued while the session was closed. "wake"
 * (default): it starts the resumed session's first turn, symmetric with
 * wake-on-idle — a resumed worker that only ever receives peer messages
 * must not strand its mail waiting for a prompt that never comes.
 * "stage": it waits in context for the first user prompt (resume-to-browse
 * without spending a turn).
 */
export function resumeMode(env: NodeJS.ProcessEnv = process.env): ResumeMode {
  return env.PI_POST_RESUME === "stage" ? "stage" : "wake";
}

export type GuardVerdict = "deliver" | "drop-duplicate" | "drop-rate";

const DUPLICATE_WINDOW_MS = 10_000;
const RATE_WINDOW_MS = 30_000;
const RATE_CAP = 8;

/**
 * Structural loop breaker, independent of what any model decides to do:
 * identical body from one sender inside 10s is dropped, and a sender is
 * throttled past 8 messages in 30s.
 */
export class LoopGuard {
  private lastBody = new Map<string, { body: string; at: number }>();
  private recent = new Map<string, number[]>();

  check(message: Message, now = Date.now()): GuardVerdict {
    const sender = message.from.address ?? `name:${message.from.name}`;

    const last = this.lastBody.get(sender);
    if (last && last.body === message.body && now - last.at < DUPLICATE_WINDOW_MS) {
      return "drop-duplicate";
    }

    const times = (this.recent.get(sender) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (times.length >= RATE_CAP) {
      this.recent.set(sender, times);
      return "drop-rate";
    }

    times.push(now);
    this.recent.set(sender, times);
    this.lastBody.set(sender, { body: message.body, at: now });
    return "deliver";
  }
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/pi-post.ts";
import { sessionAddress } from "../src/address.ts";
import { deposit } from "../src/mailbox.ts";
import { createMessage } from "../src/message.ts";

test("a refused message is consumed without waiting for a session entry", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-refuse-ext-"));
  const saved = { root: process.env.PI_POST_DIR, inbound: process.env.PI_POST_INBOUND, self: process.env.PI_SESSION_ADDRESS };
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const sent: unknown[] = [];
  const pi = {
    on: (name: string, handler: (...args: any[]) => Promise<void>) => handlers.set(name, handler),
    appendEntry: () => {}, sendMessage: (message: unknown) => sent.push(message), getSessionName: () => "worker",
    registerTool: () => {}, registerCommand: () => {}, registerMessageRenderer: () => {},
  };
  const ctx = {
    cwd: root, mode: "tui", hasUI: true,
    sessionManager: { getSessionId: () => "worker-session", getEntries: () => [], getSessionFile: () => undefined },
  };
  try {
    process.env.PI_POST_DIR = root;
    process.env.PI_POST_INBOUND = "refuse";
    const path = deposit(root, sessionAddress("worker-session"), createMessage({ from: { kind: "process", name: "sender" }, body: "work" }));
    extension(pi as unknown as ExtensionAPI);
    await handlers.get("session_start")!({}, ctx);
    assert.deepEqual(sent, []);
    assert.equal(existsSync(path), false);
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    for (const [key, value] of [["PI_POST_DIR", saved.root], ["PI_POST_INBOUND", saved.inbound], ["PI_SESSION_ADDRESS", saved.self]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});

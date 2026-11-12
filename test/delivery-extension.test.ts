import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/pi-post.ts";
import { sessionAddress } from "../src/address.ts";
import { deposit } from "../src/mailbox.ts";
import { createMessage } from "../src/message.ts";

test("print resume stages mail until the prompt and acknowledges only persisted entries", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-delivery-ext-"));
  const oldRoot = process.env.PI_POST_DIR;
  const oldSelf = process.env.PI_SESSION_ADDRESS;
  const oldResume = process.env.PI_POST_RESUME;
  const sessionFile = join(root, "session.jsonl");
  const entries: any[] = [];
  const sent: any[] = [];
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const pi = {
    on: (name: string, handler: (...args: any[]) => Promise<void>) => handlers.set(name, handler),
    appendEntry: () => {},
    sendMessage: (message: any, options: any) => sent.push({ message, options }),
    getSessionName: () => "worker",
    registerTool: () => {}, registerCommand: () => {}, registerMessageRenderer: () => {},
  };
  const ctx = {
    cwd: root, mode: "print", hasUI: false,
    sessionManager: { getSessionId: () => "worker-session", getEntries: () => entries, getSessionFile: () => sessionFile },
  };
  const address = sessionAddress("worker-session");
  const messages = [1, 2, 3].map((n) => createMessage({
    from: { kind: "process", name: `sender-${n}` }, body: `message-${n}`,
  }));
  try {
    process.env.PI_POST_DIR = root;
    delete process.env.PI_POST_RESUME;
    const paths = messages.map((message) => deposit(root, address, message));
    extension(pi as unknown as ExtensionAPI);
    await handlers.get("session_start")!({}, ctx);
    assert.equal(sent.length, 3);
    for (const delivery of sent) assert.deepEqual(delivery.options, { deliverAs: "nextTurn", triggerTurn: false });
    assert.ok(paths.every(existsSync), "staged mail must remain on disk");
    // message_end runs before pi persists the entry.
    await handlers.get("message_end")!({ message: { role: "custom", ...sent[0].message } }, ctx);
    assert.ok(paths.every(existsSync));
    entries.push({ type: "custom_message", ...sent[0].message });
    await handlers.get("agent_settled")!({}, ctx);
    assert.ok(paths.every(existsSync), "in-memory entries alone are not durable");
    writeFileSync(sessionFile, `${JSON.stringify({ ...entries[0], content: "replaced" })}\n`);
    await handlers.get("agent_settled")!({}, ctx);
    assert.ok(paths.every(existsSync), "a different persisted body is not a receipt");
    writeFileSync(sessionFile, `${JSON.stringify(entries[0])}\n`);
    await handlers.get("agent_settled")!({}, ctx);
    const persistedIndex = messages.findIndex((message) => message.id === sent[0].message.details.message.id);
    assert.ok(persistedIndex >= 0);
    assert.equal(existsSync(paths[persistedIndex]!), false);
    const unpersisted = paths.filter((_, index) => index !== persistedIndex);
    assert.ok(unpersisted.every(existsSync));
    await handlers.get("session_shutdown")!({}, ctx);
    // The two unpersisted messages remain queued for the next process.
    assert.ok(unpersisted.every(existsSync));
    extension(pi as unknown as ExtensionAPI);
    await handlers.get("session_start")!({}, ctx);
    assert.deepEqual(new Set(sent.slice(3).map((delivery) => delivery.message.details.message.id)),
      new Set(messages.filter((_, index) => index !== persistedIndex).map((message) => message.id)));
    assert.ok(unpersisted.every(existsSync));
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    for (const [key, value] of [["PI_POST_DIR", oldRoot], ["PI_SESSION_ADDRESS", oldSelf], ["PI_POST_RESUME", oldResume]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});

test("interactive resume keeps wake delivery", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-wake-ext-"));
  const oldRoot = process.env.PI_POST_DIR;
  const oldSelf = process.env.PI_SESSION_ADDRESS;
  const oldResume = process.env.PI_POST_RESUME;
  const sent: any[] = [];
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const pi = {
    on: (name: string, handler: (...args: any[]) => Promise<void>) => handlers.set(name, handler),
    appendEntry: () => {}, sendMessage: (_message: any, options: any) => sent.push(options),
    getSessionName: () => "worker", registerTool: () => {}, registerCommand: () => {}, registerMessageRenderer: () => {},
  };
  const ctx = {
    cwd: root, mode: "tui", hasUI: true,
    sessionManager: { getSessionId: () => "worker-session", getEntries: () => [], getSessionFile: () => undefined },
  };
  try {
    process.env.PI_POST_DIR = root;
    delete process.env.PI_POST_RESUME;
    const path = deposit(root, sessionAddress("worker-session"), createMessage({ from: { kind: "process", name: "sender" }, body: "work" }));
    extension(pi as unknown as ExtensionAPI);
    await handlers.get("session_start")!({}, ctx);
    assert.deepEqual(sent, [{ deliverAs: "steer", triggerTurn: true }]);
    assert.ok(existsSync(path), "a queued steer is not yet persisted");
    const second = deposit(root, sessionAddress("worker-session"), createMessage({ from: { kind: "process", name: "other" }, body: "more work" }));
    for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sent.length, 2, "the watcher sends only the new message");
    assert.ok(existsSync(path) && existsSync(second), "the watcher must not drop pending mail as a duplicate");
  } finally {
    await handlers.get("session_shutdown")?.({}, ctx);
    for (const [key, value] of [["PI_POST_DIR", oldRoot], ["PI_SESSION_ADDRESS", oldSelf], ["PI_POST_RESUME", oldResume]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});

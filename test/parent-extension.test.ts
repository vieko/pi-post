import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/pi-post.ts";
import { sessionAddress } from "../src/address.ts";
import { deposit } from "../src/mailbox.ts";
import { createMessage } from "../src/message.ts";
import { readRecord } from "../src/registry.ts";

test("startup records the parent, clears inheritance, and restores delivery after resume", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-parent-ext-"));
  const oldRoot = process.env.PI_POST_DIR;
  const oldParent = process.env.PI_POST_PARENT;
  const oldSelf = process.env.PI_SESSION_ADDRESS;
  const oldResume = process.env.PI_POST_RESUME;
  const parent = "s-bbbbbbbbbbbb";
  const self = sessionAddress("worker-session");
  const entries: { type: string; customType: string; data: unknown }[] = [];
  const deliveries: string[] = [];
  const handlers = new Map<string, (...args: any[]) => Promise<void>>();
  const pi = {
    on: (name: string, handler: (...args: any[]) => Promise<void>) => handlers.set(name, handler),
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
    sendMessage: (message: { content: string }) => deliveries.push(message.content),
    getSessionName: () => "worker",
    registerTool: () => {},
    registerCommand: () => {},
    registerMessageRenderer: () => {},
  };
  const ctx = {
    cwd: root,
    sessionManager: { getSessionId: () => "worker-session", getEntries: () => entries },
    hasUI: false,
  };
  const queue = () => deposit(root, self, createMessage({
    from: { kind: "session", name: "summoner", address: parent },
    body: "do work",
  }));
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    process.env.PI_POST_DIR = root;
    process.env.PI_POST_PARENT = parent;
    delete process.env.PI_POST_RESUME;
    extension(pi as unknown as ExtensionAPI);
    queue();
    await handlers.get("session_start")!({}, ctx);
    assert.equal(process.env.PI_POST_PARENT, undefined);
    assert.equal(readRecord(root, self)?.parent, parent);
    assert.deepEqual(entries, [{ type: "custom", customType: "pi-post-parent", data: { parent } }]);
    assert.match(deliveries[0]!, /This came from your summoner/);
    await handlers.get("session_shutdown")!();

    process.env.PI_POST_PARENT = "s-cccccccccccc";
    queue();
    // A fresh extension instance models resume with the persisted entries.
    extension(pi as unknown as ExtensionAPI);
    await handlers.get("session_start")!({}, ctx);
    assert.equal(process.env.PI_POST_PARENT, undefined);
    assert.equal(readRecord(root, self)?.parent, parent);
    assert.equal(entries.length, 1);
    assert.match(deliveries[1]!, /This came from your summoner/);
    await handlers.get("session_shutdown")!();
  } finally {
    await handlers.get("session_shutdown")?.();
    restore("PI_POST_DIR", oldRoot);
    restore("PI_POST_PARENT", oldParent);
    restore("PI_SESSION_ADDRESS", oldSelf);
    restore("PI_POST_RESUME", oldResume);
  }
});

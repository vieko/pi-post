import { test } from "node:test";
import assert from "node:assert/strict";
import { pickParent } from "../src/parent.ts";

const self = "s-aaaaaaaaaaaa";
const parent = "s-bbbbbbbbbbbb";
const other = "s-cccccccccccc";
const entry = (value: unknown) => ({ type: "custom", customType: "pi-post-parent", data: { parent: value } });

test("a valid environment parent is bound once and survives restart and resume", () => {
  const first = pickParent([], parent, self);
  assert.deepEqual(first, { parent, append: true });
  const entries = [entry(first.parent)];
  assert.deepEqual(pickParent(entries, undefined, self), { parent, append: false });
  assert.deepEqual(pickParent(entries, other, self), { parent, append: false });
});

test("empty, malformed and self addresses are ignored", () => {
  for (const value of [undefined, "", " ", "s-123", "S-BBBBBBBBBBBB", self]) {
    assert.deepEqual(pickParent([], value, self), { parent: undefined, append: false });
  }
});

test("an existing entry wins over the environment even when invalid", () => {
  for (const value of [undefined, "bad", self, 12]) {
    assert.deepEqual(pickParent([entry(value)], parent, self), { parent: undefined, append: false });
  }
});

test("only custom parent entries count and the first binding wins", () => {
  const entries = [
    { type: "message", customType: "pi-post-parent", data: { parent: other } },
    { type: "custom", customType: "other", data: { parent: other } },
    entry(parent),
    entry(other),
  ];
  assert.deepEqual(pickParent(entries, other, self), { parent, append: false });
});

test("a fork with the copied entry retains the original parent", () => {
  assert.deepEqual(pickParent([entry(parent)], undefined, other), { parent, append: false });
});

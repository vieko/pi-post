import { isAddress } from "./address.ts";

/** Session-wide binding, independent of the active conversation branch. */
export function pickParent(
  entries: readonly { type: string; customType?: string; data?: unknown }[],
  envParent: string | undefined,
  selfAddress: string,
): { parent?: string; append: boolean } {
  const entry = entries.find((item) => item.type === "custom" && item.customType === "pi-post-parent");
  const data = entry?.data;
  const candidate = entry
    ? (typeof data === "object" && data !== null ? (data as { parent?: unknown }).parent : undefined)
    : envParent;
  const parent = typeof candidate === "string" && isAddress(candidate) && candidate !== selfAddress
    ? candidate
    : undefined;
  return { parent, append: !entry && parent !== undefined };
}

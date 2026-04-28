import crypto from "node:crypto";

export function buildTextHash(text: string): string {
  return crypto.createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

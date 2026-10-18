import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mailDataDir } from "./paths";

function secret(): string {
  if (process.env.MAIL_SECRET && process.env.MAIL_SECRET.length >= 16) {
    return process.env.MAIL_SECRET;
  }
  const path = `${mailDataDir()}/secret`;
  if (existsSync(path)) return readFileSync(path, "utf8").trim();
  const generated = randomBytes(32).toString("hex");
  writeFileSync(path, generated, { mode: 0o600 });
  return generated;
}

function key(): Buffer {
  return scryptSync(secret(), "mail-right-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

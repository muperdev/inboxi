import { mkdirSync } from "node:fs";

export function mailDataDir(): string {
  const configured = process.env.MAIL_DATA_DIR?.trim();
  const dir = configured && configured.length > 0 ? configured : "data";
  mkdirSync(dir, { recursive: true });
  return dir;
}

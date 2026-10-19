import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

function run(command: string, args: string[], extra: Record<string, string> = {}): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code ?? "unknown"}`));
    });
  });
}

const bundledClientPath = "server/google-client.bundled.ts";
const bundledClientSource = readFileSync(bundledClientPath, "utf8");
writeFileSync(bundledClientPath, bundledGoogleClientModule());
try {
  await run("bun", [
    "build",
    "server/index.ts",
    "--compile",
    "--outfile",
    "dist-server/mailright-server",
  ]);
} finally {
  writeFileSync(bundledClientPath, bundledClientSource);
}

await run("bun", ["run", "next", "build"], { MAILRIGHT_DIST_DIR: ".next-pack" });

mkdirSync(".next-pack/standalone/.next-pack", { recursive: true });
cpSync(".next-pack/static", ".next-pack/standalone/.next-pack/static", { recursive: true });
cpSync("public", ".next-pack/standalone/public", { recursive: true });

await run("bun", ["run", "electron-builder", "--", "--mac", "dmg"], {
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});

function bundledGoogleClientModule(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId.endsWith(".apps.googleusercontent.com") || clientSecret.length === 0) {
    throw new Error("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env before bun run desktop.");
  }
  return `export const bundledGoogleClientId = ${JSON.stringify(clientId)};\nexport const bundledGoogleClientSecret = ${JSON.stringify(clientSecret)};\n`;
}

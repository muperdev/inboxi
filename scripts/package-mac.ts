import { spawn } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";

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

await run("bun", [
  "build",
  "server/index.ts",
  "--compile",
  "--outfile",
  "dist-server/mailright-server",
]);

await run("bun", ["run", "next", "build"], { MAILRIGHT_DIST_DIR: ".next-pack" });

mkdirSync(".next-pack/standalone/.next-pack", { recursive: true });
cpSync(".next-pack/static", ".next-pack/standalone/.next-pack/static", { recursive: true });
cpSync("public", ".next-pack/standalone/public", { recursive: true });

await run("bun", ["run", "electron-builder", "--", "--mac", "dmg"], {
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
});

import { spawn } from "node:child_process";

const web = spawn("bun", ["run", "dev:web"], { stdio: "inherit" });
const mail = spawn("bun", ["run", "dev:mail"], { stdio: "inherit" });

function stop(): void {
  web.kill("SIGTERM");
  mail.kill("SIGTERM");
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

for (const child of [web, mail]) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stop();
      process.exit(code);
    }
  });
}

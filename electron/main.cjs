const { app, BrowserWindow, nativeTheme } = require("electron");
const { spawn } = require("node:child_process");
const { createWriteStream, existsSync, mkdirSync } = require("node:fs");
const net = require("node:net");
const { homedir } = require("node:os");
const path = require("node:path");

const children = [];

function nodeExecutable() {
  const name = `${app.getName()} Helper`;
  const helper = path.join(
    path.dirname(process.execPath),
    "..",
    "Frameworks",
    `${name}.app`,
    "Contents",
    "MacOS",
    name,
  );
  return existsSync(helper) ? helper : process.execPath;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, child) {
  const deadline = Date.now() + 30_000;
  let failure = null;
  const onExit = (code) => {
    failure = new Error(`Inboxi process exited (${code ?? "unknown"})`);
  };
  child?.once("exit", onExit);
  child?.once("error", (error) => {
    failure = error instanceof Error ? error : new Error("Inboxi process failed to start");
  });
  try {
    while (Date.now() < deadline) {
      if (failure) throw failure;
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for ${url}`);
  } finally {
    child?.off("exit", onExit);
  }
}

async function startPackaged() {
  const apiPort = await freePort();
  const webPort = await freePort();
  const resources = process.resourcesPath;
  const dataDir = app.getPath("userData");
  mkdirSync(dataDir, { recursive: true });
  const log = createWriteStream(path.join(dataDir, "mailright.log"), { flags: "a" });
  const mail = spawn(path.join(resources, "mailright-server"), [], {
    cwd: dataDir,
    env: {
      ...process.env,
      MAIL_API_PORT: String(apiPort),
      MAIL_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  mail.stdout?.pipe(log);
  mail.stderr?.pipe(log);
  children.push(mail);
  const web = spawn(nodeExecutable(), ["server.js"], {
    cwd: path.join(resources, "standalone"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(webPort),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  web.stdout?.pipe(log);
  web.stderr?.pipe(log);
  children.push(web);
  await waitFor(`http://127.0.0.1:${apiPort}/health`, mail);
  await waitFor(`http://127.0.0.1:${webPort}`, web);
  return {
    apiUrl: `http://127.0.0.1:${apiPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
  };
}

function openWindow(webUrl, apiUrl) {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Inboxi",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0d0d0d" : "#f4f0f6",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: apiUrl ? [`--mail-api=${apiUrl}`] : [],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadURL(webUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName("Inboxi");
  app.setPath(
    "userData",
    path.join(homedir(), "Library", "Application Support", "mail-right"),
  );
  app.whenReady().then(async () => {
    if (!app.isPackaged) {
      openWindow("http://localhost:3000", "");
      return;
    }
    const urls = await startPackaged();
    openWindow(urls.webUrl, urls.apiUrl);
  }).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  for (const child of children) child.kill();
});

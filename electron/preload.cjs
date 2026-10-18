const { contextBridge } = require("electron");

const argument = process.argv.find((item) => item.startsWith("--mail-api="));
const apiUrl = argument ? argument.slice("--mail-api=".length) : "";

contextBridge.exposeInMainWorld("mailright", apiUrl ? { apiUrl } : {});

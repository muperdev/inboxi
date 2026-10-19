import { ImapFlow } from "imapflow";
import type { ProviderId } from "../lib/mail-types";

export type ImapLogin = {
  host: string;
  port: number;
  username: string;
  password?: string;
  accessToken?: string;
  email: string;
};

export function createImapClient(login: ImapLogin, verifyOnly = false): ImapFlow {
  return new ImapFlow({
    host: login.host,
    port: login.port,
    secure: true,
    auth: login.accessToken
      ? { user: login.username, accessToken: login.accessToken }
      : { user: login.username, pass: login.password },
    logger: false,
    disableAutoIdle: true,
    verifyOnly,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
    clientInfo: { name: "Inboxi", version: "0.1.0" },
  });
}

export async function testImapLogin(login: ImapLogin): Promise<void> {
  const client = createImapClient(login, true);
  client.on("error", () => undefined);
  try {
    await client.connect();
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export function keepsSentCopy(provider: ProviderId): boolean {
  return provider === "icloud" || provider === "gmail";
}

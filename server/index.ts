import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { askMail, rewriteDraft } from "./assistant";
import { bus, notify } from "./bus";
import { mailDb } from "./db";
import { MailError, humanError } from "./errors";
import { AuthenticationFailure } from "imapflow";
import { nameFromEmail } from "../lib/format";
import { presetFor } from "../lib/providers";
import { googleRefreshSecret, signInWithGoogle } from "./google-auth";
import { testImapLogin } from "./imap";
import { applyThreadAction, downloadAttachment } from "./mailbox-actions";
import { startAccount, startSavedAccounts, stopAccount } from "./runtime";
import { sendMessage, verifySmtp } from "./send-mail";
import {
  ftsQuery,
  readAction,
  readAliasInput,
  readAsk,
  readAssistantSettings,
  readConnectInput,
  readRewrite,
  readSendInput,
} from "./validate";
import { parseMailFolder } from "../lib/mail-types";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) =>
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["content-type"],
  }),
);

app.onError((error, c) => {
  if (!(error instanceof MailError)) console.error(error);
  const message = humanError(error);
  const status = error instanceof MailError ? 400 : 500;
  return c.json({ error: message }, status);
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/bootstrap", (c) =>
  c.json({
    accounts: mailDb.listAccounts(),
    identities: mailDb.listIdentities(),
    folders: mailDb.listFolders(),
  }),
);

app.get("/threads", (c) => {
  const folder = parseMailFolder(c.req.query("folder") ?? null);
  const account = c.req.query("account") || null;
  const alias = c.req.query("alias") || null;
  const requested = Number(c.req.query("limit") ?? 200);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 500) : 200;
  return c.json(mailDb.listThreads(folder, account, alias, limit));
});

app.get("/search", (c) => {
  const match = ftsQuery(c.req.query("q") ?? "");
  if (!match) return c.json([]);
  return c.json(mailDb.searchThreads(match, 40));
});

app.get("/threads/:id", (c) => {
  const thread = mailDb.getThread(c.req.param("id"));
  if (!thread) return c.json({ error: "That conversation is gone." }, 404);
  return c.json(thread);
});

app.post("/threads/:id/action", async (c) => {
  const action = readAction(await c.req.json());
  await applyThreadAction(c.req.param("id"), action);
  return c.body(null, 204);
});

app.post("/accounts/google", async (c) => {
  const session = await signInWithGoogle();
  if (mailDb.emailExists(session.email)) throw new MailError("That inbox is already connected.");
  const preset = presetFor("gmail");
  const password = googleRefreshSecret(session.refreshToken);
  try {
    await testImapLogin({
      host: preset.imapHost,
      port: preset.imapPort,
      username: session.email,
      accessToken: session.accessToken,
      email: session.email,
    });
    await verifySmtp({
      provider: "gmail",
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      smtpSecure: preset.smtpSecure,
      username: session.email,
      password,
    });
  } catch (error) {
    if (error instanceof AuthenticationFailure) {
      throw new MailError("Google signed in, but Gmail refused the mailbox. Turn IMAP on in Gmail settings.");
    }
    throw error instanceof MailError ? error : new MailError(humanError(error));
  }
  const account = mailDb.insertAccount({
    provider: "gmail",
    email: session.email,
    displayName: session.name || nameFromEmail(session.email),
    password,
    username: session.email,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
    smtpSecure: preset.smtpSecure,
    aliases: [],
  });
  startAccount(account.id);
  notify();
  return c.json(account);
});

app.post("/accounts", async (c) => {
  const input = readConnectInput(await c.req.json());
  if (mailDb.emailExists(input.email)) throw new MailError("That inbox is already connected.");
  try {
    await testImapLogin({
      host: input.imapHost,
      port: input.imapPort,
      username: input.username,
      password: input.password,
      email: input.email,
    });
    await verifySmtp(input);
  } catch (error) {
    throw new MailError(humanError(error));
  }
  const account = mailDb.insertAccount(input);
  startAccount(account.id);
  notify();
  return c.json(account);
});

app.delete("/accounts/:id", (c) => {
  const accountId = c.req.param("id");
  stopAccount(accountId);
  mailDb.deleteAccount(accountId);
  notify();
  return c.body(null, 204);
});

app.post("/accounts/:id/aliases", async (c) => {
  const alias = readAliasInput(await c.req.json());
  const identity = mailDb.addAlias(c.req.param("id"), alias);
  notify();
  return c.json(identity);
});

app.delete("/identities/:id", (c) => {
  mailDb.deleteIdentity(c.req.param("id"));
  notify();
  return c.body(null, 204);
});

app.get("/settings", (c) => c.json(mailDb.assistantSettings()));

app.put("/settings", async (c) => {
  mailDb.saveAssistantSettings(readAssistantSettings(await c.req.json()));
  return c.json(mailDb.assistantSettings());
});

app.post("/ai/rewrite", async (c) => {
  const input = readRewrite(await c.req.json());
  return c.json({ text: await rewriteDraft(input) });
});

app.post("/ai/ask", async (c) => {
  const prompt = readAsk(await c.req.json());
  return c.json(await askMail(prompt));
});

app.post("/send", async (c) => {
  const input = readSendInput(await c.req.json());
  return c.json(await sendMessage(input));
});

app.get("/messages/:id/attachments/:index", async (c) => {
  const index = Number(c.req.param("index"));
  if (!Number.isInteger(index) || index < 0) throw new MailError("That attachment is gone.");
  const file = await downloadAttachment(c.req.param("id"), index);
  const filename = file.filename.replaceAll('"', "");
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
});

app.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    let closed = false;
    const unsubscribe = bus.subscribe((event) => {
      if (closed) return;
      void stream.writeSSE({ data: JSON.stringify(event) });
    });
    stream.onAbort(() => {
      closed = true;
      unsubscribe();
    });
    await stream.writeSSE({ data: JSON.stringify({ type: "changed" }) });
    await new Promise<void>((resolve) => {
      if (closed) resolve();
      stream.onAbort(() => resolve());
    });
  }),
);

const port = Number(process.env.MAIL_API_PORT ?? 8787);

startSavedAccounts();
console.log(`Inboxi listening on http://127.0.0.1:${port}`);

export default {
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
  idleTimeout: 0,
};

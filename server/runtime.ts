import type { ImapFlow } from "imapflow";
import { AuthenticationFailure } from "imapflow";
import { notify } from "./bus";
import { mailDb } from "./db";
import { MailError, humanError } from "./errors";
import { createImapClient } from "./imap";
import { discoverFolders, syncFolder } from "./sync-folder";

type Job = {
  run: () => Promise<void>;
  reject: (error: unknown) => void;
};

class AccountRuntime {
  private client: ImapFlow | null = null;
  private jobs: Job[] = [];
  private wake: (() => void) | null = null;
  private stopped = false;
  private accepting = true;
  private cycles = 0;

  constructor(private readonly accountId: string) {}

  start(): void {
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.accepting = false;
    this.rejectPending(new MailError("This account was removed."));
    this.wake?.();
    const client = this.client;
    if (client) void client.logout().catch(() => client.close());
  }

  enqueue<T>(task: (client: ImapFlow) => Promise<T>): Promise<T> {
    if (!this.accepting) {
      return Promise.reject(new MailError("This account needs to be reconnected."));
    }
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({
        reject,
        run: async () => {
          try {
            if (!this.client?.usable) throw new MailError("Mailbox is reconnecting.");
            resolve(await task(this.client));
          } catch (error) {
            reject(error);
          }
        },
      });
      this.wake?.();
    });
  }

  private rejectPending(error: Error): void {
    const pending = this.jobs.splice(0);
    for (const job of pending) job.reject(error);
  }

  private async drainJobs(): Promise<void> {
    while (this.jobs.length > 0 && !this.stopped) {
      const job = this.jobs.shift();
      if (job) await job.run();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private async loop(): Promise<void> {
    let delay = 2_000;
    while (!this.stopped && this.accepting) {
      try {
        await this.connectAndRun();
        delay = 2_000;
      } catch (error) {
        if (this.stopped) return;
        const message = humanError(error);
        mailDb.setSync(this.accountId, "error", message);
        notify();
        console.error(message);
        if (error instanceof AuthenticationFailure) {
          this.accepting = false;
          this.rejectPending(error);
          return;
        }
        await this.sleep(delay);
        delay = Math.min(delay * 2, 60_000);
      }
    }
  }

  private async connectAndRun(): Promise<void> {
    const secret = mailDb.getSecret(this.accountId);
    if (!secret) return;
    mailDb.setSync(this.accountId, "connecting", null);
    notify();

    const client = createImapClient({
      host: secret.imapHost,
      port: secret.imapPort,
      username: secret.username,
      password: secret.password,
      email: secret.email,
    });
    client.on("error", () => undefined);
    this.client = client;

    try {
      await client.connect();
      mailDb.setSync(this.accountId, "syncing", null);
      notify();
      console.log(`Syncing ${secret.email}`);

      while (!this.stopped && client.usable) {
        if (this.cycles % 10 === 0) await discoverFolders(client, this.accountId);
        this.cycles += 1;
        for (const folder of mailDb.syncFolders(this.accountId)) {
          if (this.stopped || !client.usable) return;
          await this.drainJobs();
          await syncFolder(client, this.accountId, folder);
          mailDb.recount(this.accountId);
          notify();
        }
        mailDb.setSync(this.accountId, "idle", null);
        notify();
        await this.drainJobs();
        if (this.jobs.length > 0) continue;
        await this.idleInbox(client);
      }
    } finally {
      this.client = null;
      await client.logout().catch(() => client.close());
    }
  }

  private async idleInbox(client: ImapFlow): Promise<void> {
    const inbox = mailDb.folderByRole(this.accountId, "inbox");
    if (!inbox) {
      await this.sleep(20_000);
      return;
    }

    let grew = false;
    const lock = await client.getMailboxLock(inbox.path);
    const before = client.mailbox ? client.mailbox.exists : 0;
    try {
      const idleDone = client.idle();
      const timer = setTimeout(() => {
        void client.noop().catch(() => undefined);
      }, 25_000);
      this.wake = () => {
        clearTimeout(timer);
        void client.noop().catch(() => undefined);
      };
      await idleDone;
      clearTimeout(timer);
      const after = client.mailbox ? client.mailbox.exists : before;
      grew = after > before;
    } finally {
      this.wake = null;
      lock.release();
    }

    if (!grew) return;
    const folder = mailDb.syncFolders(this.accountId).find((item) => item.id === inbox.id);
    if (!folder) return;
    await syncFolder(client, this.accountId, folder);
    mailDb.recount(this.accountId);
    notify();
  }
}

const runtimes = new Map<string, AccountRuntime>();

export function startSavedAccounts(): void {
  for (const accountId of mailDb.listAccountIds()) startAccount(accountId);
}

export function startAccount(accountId: string): void {
  if (runtimes.has(accountId)) return;
  const runtime = new AccountRuntime(accountId);
  runtimes.set(accountId, runtime);
  runtime.start();
}

export function stopAccount(accountId: string): void {
  runtimes.get(accountId)?.stop();
  runtimes.delete(accountId);
}

export function enqueueAccount<T>(
  accountId: string,
  task: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const runtime = runtimes.get(accountId);
  if (!runtime) throw new MailError("That account is still starting. Try again in a moment.");
  return runtime.enqueue(task);
}

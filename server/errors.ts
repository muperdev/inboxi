import { AuthenticationFailure } from "imapflow";

export class MailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailError";
  }
}

export function humanError(error: unknown): string {
  if (error instanceof MailError) return error.message;
  if (error instanceof AuthenticationFailure) {
    return "Login failed. Use an app-specific password, and turn IMAP on for this account.";
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/auth|invalid credentials|authenticationfailed|login failed/i.test(message)) {
      return "Login failed. Use an app-specific password, and turn IMAP on for this account.";
    }
    if (message.length > 0 && message.length < 220) return message;
  }
  return "Could not reach the mail server.";
}

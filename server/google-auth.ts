import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { bundledGoogleClientId, bundledGoogleClientSecret } from "./google-client.bundled";
import { MailError } from "./errors";

const refreshPrefix = "grefresh:";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

type GoogleClient = {
  clientId: string;
  clientSecret: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

const accessTokens = new Map<string, CachedToken>();

export type GoogleSession = {
  email: string;
  name: string;
  refreshToken: string;
  accessToken: string;
};

export function googleRefreshSecret(refreshToken: string): string {
  return `${refreshPrefix}${refreshToken}`;
}

export function isGoogleRefresh(secret: string): boolean {
  return secret.startsWith(refreshPrefix);
}

export async function accessTokenFor(stored: string): Promise<string> {
  const refreshToken = stored.slice(refreshPrefix.length);
  const cached = accessTokens.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const client = readGoogleClient();
  const body = new URLSearchParams({
    client_id: client.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (client.clientSecret.length > 0) body.set("client_secret", client.clientSecret);
  const issued = await requestToken(body);
  if (issued.accessToken.length === 0) {
    throw new MailError("Google sign-in expired. Connect Gmail again.");
  }
  remember(refreshToken, issued.accessToken, issued.expiresIn);
  return issued.accessToken;
}

export function signInWithGoogle(): Promise<GoogleSession> {
  const client = readGoogleClient();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  return new Promise((resolve, reject) => {
    let settled = false;
    let server: Server | null = null;
    let redirect = "";
    const timer = setTimeout(() => {
      finish(() => reject(new MailError("Google sign-in timed out.")));
    }, 180_000);

    const finish = (next: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server?.close();
      next();
    };

    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        "<!doctype html><title>Inboxi</title><p>You can close this window and return to Inboxi.</p>",
      );
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (error || url.searchParams.get("state") !== state || !code) {
        finish(() => reject(new MailError("Google sign-in was cancelled.")));
        return;
      }
      finish(() => {
        void completeSignIn(client, verifier, redirect, code).then(resolve, reject);
      });
    });

    server.listen(0, "127.0.0.1", () => {
      redirect = redirectUri(server);
      void challengeFor(verifier).then((challenge) => {
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.searchParams.set("client_id", client.clientId);
        auth.searchParams.set("redirect_uri", redirect);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("scope", "openid email https://mail.google.com/");
        auth.searchParams.set("access_type", "offline");
        auth.searchParams.set("prompt", "consent");
        auth.searchParams.set("code_challenge", challenge);
        auth.searchParams.set("code_challenge_method", "S256");
        auth.searchParams.set("state", state);
        const opened = spawn("open", [auth.toString()], { detached: true, stdio: "ignore" });
        opened.on("error", () => {
          finish(() => reject(new MailError("Could not open Google sign-in.")));
        });
        opened.unref();
      }, (error: unknown) => {
        finish(() => reject(error instanceof Error ? error : new MailError("Could not open Google sign-in.")));
      });
    });

    server.on("error", () => {
      finish(() => reject(new MailError("Could not open Google sign-in.")));
    });
  });
}

function redirectUri(server: Server | null): string {
  const address = server?.address();
  const port = address && typeof address === "object" ? address.port : 0;
  return `http://127.0.0.1:${port}/callback`;
}

async function completeSignIn(
  client: GoogleClient,
  verifier: string,
  redirect: string,
  code: string,
): Promise<GoogleSession> {
  const body = new URLSearchParams({
    client_id: client.clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirect,
  });
  if (client.clientSecret.length > 0) body.set("client_secret", client.clientSecret);
  const issued = await requestToken(body);
  if (issued.refreshToken.length === 0) {
    throw new MailError("Google did not grant mailbox access. Try signing in again.");
  }
  remember(issued.refreshToken, issued.accessToken, issued.expiresIn);
  const profile = await googleProfile(issued.accessToken);
  return {
    email: profile.email,
    name: profile.name,
    refreshToken: issued.refreshToken,
    accessToken: issued.accessToken,
  };
}

async function googleProfile(accessToken: string): Promise<{ email: string; name: string }> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new MailError("Google did not share the account address.");
  }
  const record = payload as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!email.includes("@")) throw new MailError("Google did not share the account address.");
  return { email, name };
}

async function requestToken(body: URLSearchParams): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new MailError(tokenFailure(payload));
  }
  const record = payload as Record<string, unknown>;
  const accessToken = typeof record.access_token === "string" ? record.access_token : "";
  const refreshToken = typeof record.refresh_token === "string" ? record.refresh_token : "";
  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : 3600;
  if (accessToken.length === 0) throw new MailError(tokenFailure(payload));
  return { accessToken, refreshToken, expiresIn };
}

function tokenFailure(payload: unknown): string {
  const error =
    payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "";
  if (error === "invalid_client" || error === "unauthorized_client") {
    return "Google rejected Inboxi's sign-in client.";
  }
  if (error === "invalid_grant") return "Google sign-in expired. Connect Gmail again.";
  return "Google did not finish signing in.";
}

function remember(refreshToken: string, accessToken: string, expiresIn: number): void {
  accessTokens.set(refreshToken, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function readGoogleClient(): GoogleClient {
  const fromBuild = clientFrom(bundledGoogleClientId, bundledGoogleClientSecret);
  if (fromBuild) return fromBuild;
  const fromEnv = clientFrom(process.env.GOOGLE_CLIENT_ID ?? "", process.env.GOOGLE_CLIENT_SECRET ?? "");
  if (fromEnv) return fromEnv;
  throw new MailError("Gmail sign-in is not included in this build.");
}

function clientFrom(clientId: string, clientSecret: string): GoogleClient | null {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id.endsWith(".apps.googleusercontent.com") || secret.length === 0) return null;
  return { clientId: id, clientSecret: secret };
}

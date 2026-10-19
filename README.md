# Inboxi

A local mail client for iCloud and Gmail. Messages, passwords, and the assistant key stay on your computer.

## Develop

```sh
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Connect an inbox with an app-specific password. An alias is another address on an account you already connected, not a separate login.

## Assistant

Open Settings and paste your own [OpenRouter](https://openrouter.ai) API key. The key is encrypted in the local database. It is not an environment variable, and this repository does not contain one.

The assistant searches the mail already synced to this Mac, and it can rewrite a draft from a short instruction.

## Desktop

```sh
bun run desktop
```

The disk image is written to `release/`. The build is unsigned, so the first launch is Right-click, then Open.

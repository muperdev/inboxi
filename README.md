# Inboxi

A local mail client for iCloud and Gmail. Messages, passwords, and the assistant key stay on your computer.

[![CI](https://github.com/muperdev/inboxi/actions/workflows/ci.yml/badge.svg)](https://github.com/muperdev/inboxi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Download

Mac disk images are published on [Releases](https://github.com/muperdev/inboxi/releases). The build is unsigned, so the first launch is Right-click, then Open.

## Develop

You need [Bun](https://bun.sh) 1.3 or newer.

```sh
bun install
cp .env.example .env
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

`bun dev` starts two processes:

| Process | Command            | What it is                                                   |
| ------- | ------------------ | ------------------------------------------------------------ |
| Web     | `bun run dev:web`  | The Next.js interface on port 3000                           |
| Mail    | `bun run dev:mail` | The Hono server on port 8787 that syncs IMAP and sends SMTP  |

Mail is stored in SQLite under `data/`. Delete that folder to start over.

Connect an inbox with an app-specific password. An alias is another address on an account you already connected, not a separate login.

### Gmail sign-in

Gmail connects with Sign in with Google, which needs an OAuth client. Create a Desktop app client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials), then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. iCloud and IMAP accounts do not need it.

## Assistant

Open Settings and paste your own [OpenRouter](https://openrouter.ai) API key. The key is encrypted in the local database. It is not an environment variable, and this repository does not contain one.

The assistant searches the mail already synced to this Mac, and it can rewrite a draft from a short instruction.

## Desktop

```sh
bun run desktop
```

The disk image is written to `release/`. Packaging needs macOS and the Google client values in `.env`.

## Project layout

```
app/          Next.js routes and global styles
components/   Interface, with shadcn primitives in components/ui
hooks/        React hooks
lib/          Code shared by the interface and the mail server
server/       Mail server: IMAP sync, SMTP, SQLite, assistant
electron/     Desktop shell
scripts/      Dev runner and Mac packaging
```

## Contributing

Bug reports, ideas, and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request.

Report security problems privately. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

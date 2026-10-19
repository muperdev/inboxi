# Contributing to Inboxi

Thanks for helping. This page explains how changes get into Inboxi, so your time is not wasted.

## How the project is run

Inboxi has one maintainer, [@muperdev](https://github.com/muperdev). Only the maintainer pushes to `main`, merges pull requests, and publishes releases. Everyone else contributes through a fork and a pull request.

## Before you start

- **Bugs.** Search [existing issues](https://github.com/muperdev/inboxi/issues) first. If nothing matches, open a bug report with the steps to reproduce it.
- **Small fixes** like typos, broken links, and obvious one-line bugs can go straight to a pull request.
- **Features and larger changes.** Open an issue first and wait for a reply. A pull request for a feature nobody agreed on may be closed, even if the code is good.
- **Security problems.** Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## What fits Inboxi

Inboxi is a local mail client. Proposals should keep these promises:

- Mail, passwords, and keys stay on the user's computer.
- No telemetry, analytics, or tracking.
- No network calls except to the user's mail providers and the assistant provider the user configured.
- No secrets in the repository. The Google OAuth client and the OpenRouter key are supplied by the person running the app.

## Set up

You need [Bun](https://bun.sh) 1.3 or newer. Packaging the desktop app also needs macOS.

```sh
git clone https://github.com/<you>/inboxi.git
cd inboxi
bun install
cp .env.example .env
bun dev
```

The [README](README.md) explains the two dev processes and the Gmail OAuth setup.

## Make a change

1. Branch from an up-to-date `main`. Use a short, descriptive name such as `fix/thread-unread-count` or `feat/snooze`.
2. Keep each pull request to one change. Split unrelated fixes into separate pull requests.
3. Follow the existing code style. Use Bun, not npm, yarn, or pnpm, and commit `bun.lock` when dependencies change.
4. Add a dependency only when you need it, and explain why in the pull request. Prefer versions that have been published for at least a week.
5. Never commit `.env`, `data/`, `release/`, or real credentials. `server/google-client.bundled.ts` must keep its empty values.

### Check your work

Run these before you push. CI runs them on every pull request.

```sh
bun run lint
bun run build
```

If your change touches the mail server, start `bun dev`, connect a real account, and test the flow you changed. If it touches the desktop shell, run `bun run desktop` and open the built app.

### Commit messages

Write the subject as a full sentence that says what changed and why. Add a body when the reason is not obvious.

```
Keep the web server out of the Dock and switch the assistant presets.

GLM 5.3 Flash is the default, with Claude Haiku 5.5 and GPT-6 Luna beside it.
```

## Open a pull request

- Fill in the pull request template.
- Link the issue it closes, for example `Closes #12`.
- Add a screenshot or short recording for any visible change.
- Keep the pull request a draft until it is ready for review.
- CI must pass. Reply to review comments and push fixes to the same branch. Do not force-push after review starts unless asked.

Pull requests are squash-merged, so the title becomes the commit on `main`. Write it like a commit subject.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE) that covers this project.

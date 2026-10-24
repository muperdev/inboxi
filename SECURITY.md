# Security policy

Inboxi handles mail, account passwords, OAuth tokens, and API keys. Security reports are taken seriously.

## Supported versions

Only the latest release and the `main` branch get security fixes.

## Report a vulnerability

Do not open a public issue, discussion, or pull request for a security problem.

Report it privately through [GitHub security advisories](https://github.com/muperdev/inboxi/security/advisories/new). Include:

- What the problem is and what an attacker could do with it
- Steps or a proof of concept to reproduce it
- The Inboxi version or commit, and your macOS version
- Any fix you suggest

You should get a reply within 7 days. Once the issue is confirmed, a fix is prepared in a private advisory. You will be credited when it is published, unless you ask not to be.

## Scope

These are in scope:

- Leaking stored mail, passwords, OAuth tokens, or the assistant key
- Weak encryption or key handling in the local database
- Ways for a remote email, attachment, or website to run code, read local data, or reach the local mail server
- Secrets committed to the repository or bundled into a release build

These are out of scope:

- Attacks that need an attacker who already controls the user's account on the computer
- Gatekeeper warnings caused by the unsigned build
- Problems in iCloud, Gmail, or OpenRouter themselves

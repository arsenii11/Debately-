# Debately

Debately is an AI-assisted debate practice platform. It supports solo debates
against an AI opponent and real-time debates between two people, with automated
fact-checking, hints, scoring, and a final judge verdict.

## Features

- Solo debates against an AI opponent
- Human-versus-human sessions shared by link
- Live lobby, reconnect, spectator, and reaction support
- Per-turn AI fact-checking and optional hints
- Voice transcription
- Structured verdicts, scores, and shareable result pages
- Passwordless email accounts with encrypted private fields
- Local progress tracking and a Debate School preview

## Architecture

Debately is a Next.js application with server-side API routes. Gemini provides
the AI opponent, fact-checks, hints, transcription, and verdict generation.
Multiplayer state can be coordinated through Redis, while account data is kept
in SQLite with encrypted private fields and HMAC-based lookups. The application
can run directly or as a container behind Nginx.

The main areas of the codebase are:

- `app/` — pages and API routes
- `components/` — solo and multiplayer UI
- `lib/ai/` — AI workflows
- `lib/auth/` — passwordless authentication and encrypted account storage
- `lib/multiplayer/` — sessions, authorization, persistence, and live updates
- `lib/prompts.ts` — opponent and judge behavior

## Privacy and security

Runtime credentials belong in environment variables or a secret manager. Local
environment files, credentials, databases, and generated build output are
excluded from version control.

AI output can be inaccurate. Debately's fact-checks and verdicts are automated
assessments, not professional advice or authoritative statements of fact.

Please report security issues privately as described in
[`SECURITY.md`](SECURITY.md).

## Contributing

Issues and pull requests are welcome. Keep changes focused, include tests for
behavioral changes, and do not commit credentials, personal data, or production
databases.

## License

The source code is licensed under the
[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). Modified
versions made available over a network must offer their corresponding source
code to the users of that service. Debately's name, logos, and branding are not
granted for reuse by the software license.

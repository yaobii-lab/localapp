# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `localapp add -- <cmd>` — save a launch recipe without starting the service.
- `localapp init` — connect Claude Code and Codex to LocalApp with status, dry-run, targeted-agent, and uninstall flows; detect Cursor and report its manual User Rules step.
- `localapp setup` — install or update the persistent CLI, verify its version, then connect detected coding agents.
- `localapp --version` — print the installed package version for setup verification.

### Changed

- `localapp run <name>` now reopens a saved service; `localapp open <name>` remains an equivalent alias.
- Reopened services start in the background by default; `--foreground` keeps logs attached.
- Public documentation now uses the `yaobii-lab/localapp` repository identity and face-user README language.

## [0.1.0] — 2026-06

Initial public release.

### Added

- `localapp ls` — list localhost services joined with the LocalApp registry. `--json` for agents, `--all` to span every project, `--running` / `--stopped` / `--status <s>` filters.
- `localapp run -- <cmd>` — start (or reuse) a dev server and register its launch recipe. `--note` to attach intent; `--source` to override the auto-detected agent label; `--no-reuse` to skip dedup.
- `localapp adopt <port>` — annotate an already-listening port without restarting it. `--keep` to label a long-lived service; `--note` to attach meaning.
- `localapp open <app>` — replay the recorded recipe of a registered service, or print its URL if it is already alive.

### Design

- OS is the source of truth. The registry stores annotation only; liveness is read live from `lsof` on every `ls`.
- Annotate, don't intercept — an agent that ignores localapp does not break it; its server simply appears as an un-annotated port.
- No daemon, no GUI, no background process. Reads on demand, sends nothing off the machine.

[Unreleased]: https://github.com/yaobii-lab/localapp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yaobii-lab/localapp/releases/tag/v0.1.0

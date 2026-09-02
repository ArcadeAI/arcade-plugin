# Security Policy

## Scope

This repository ships an **agent plugin** for AI coding tools (Cursor, Claude
Code, VS Code, and others). It contains configuration and instructions — skills,
rules, commands, hooks, and MCP wiring — not a runtime service.

- The repo does **not** store customer data, credentials, or API keys.
- At runtime, external service tasks flow through Arcade's **hosted MCP gateway**
  (`https://api.bosslevel.dev/mcp/all-optimized`).
- Hooks are small local Node scripts that inject static guidance text; they do
  not make network calls or write files.

Security issues in the hosted gateway, OAuth flows, or connected third-party
apps are **out of scope** for this repository.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes (personal trial) |
| < 0.1   | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities through Arcade's
[Security Research Program](https://docs.arcade.dev/en/resources/security-research-program).

## In Scope for This Repo

- Secrets or credentials accidentally committed
- Unsafe behavior in hooks, scripts, or install paths shipped from this repo
- Supply-chain concerns in pinned dependencies (for example `mcp-remote`)
- Misleading security claims in documentation

## Out of Scope

- Vulnerabilities in the Arcade MCP gateway or Arcade platform infrastructure
- Issues in host AI tools (Cursor, Claude, VS Code, etc.)
- User-authorized data access through connected apps after OAuth sign-in

## Disclosure

We follow coordinated disclosure. Please keep vulnerability details private
until a fix is available or we agree on disclosure timing together.

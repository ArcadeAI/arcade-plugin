# Security Policy

## Scope

This repository ships an **agent plugin** for AI coding tools (Cursor, Claude
Code, VS Code, and others). It contains configuration and instructions — skills,
rules, commands, hooks, and MCP wiring — not a runtime service.

- The repo does **not** store customer data, credentials, or API keys.
- At runtime, external service tasks flow through Arcade's **hosted MCP gateway**
  (`https://api.bosslevel.dev/mcp/all-optimized`).

Security issues in the hosted gateway, OAuth flows, or connected third-party
apps are **out of scope** for this repository.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes |
| < 0.1   | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities through Arcade's
[Security Research Program](https://docs.arcade.dev/en/resources/security-research-program).


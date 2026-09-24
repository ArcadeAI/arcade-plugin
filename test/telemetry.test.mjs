import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { readRepoFile, ROOT } from "./helpers.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import { HOSTS } from "../hooks/hook-hosts.mjs";
import { ARCADE_TOOL_PREFIX, EVENTS, eventSchema } from "../hooks/telemetry-contract.mjs";
import { buildEvent } from "../hooks/telemetry-events.mjs";
import { EVENT_ENV, PLUGIN_VERSION, POSTHOG_KEY } from "../hooks/telemetry-config.mjs";

const OPTIONS = { os: "darwin", arcadeUsedBefore: false };
const SESSION_ID = "raw-session-id-123";
const PROMPT_ID = "raw-prompt-id-456";
const OPERATOR = "arcade:arcade-operator";

const validateEvent = new Ajv2020({ allErrors: true }).compile(eventSchema());
const assertMatchesContract = (event, label = JSON.stringify(event)) => {
  assert.equal(validateEvent(event), true, `${label}: ${JSON.stringify(validateEvent.errors)}`);
};

// Runs telemetry.mjs the way hooks.json does, with the given environment.
const runHook = (script, stdin, env, extraArgs = []) =>
  spawnSync(process.execPath, [path.join(ROOT, "hooks", script), "--host", "claude-code", ...extraArgs], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

const hash16 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const SESSION_HASH = hash16(SESSION_ID);

const hookInput = (fields) => ({
  session_id: SESSION_ID,
  prompt_id: PROMPT_ID,
  cwd: "/Users/someone/private-repo",
  ...fields,
});

// The full event buildEvent should return for hookInput() fields.
const expectedEvent = (event, extra) => {
  const properties = {
    ...extra,
    host: "claude-code",
    plugin_version: PLUGIN_VERSION,
    os: "darwin",
    $process_person_profile: false,
    $geoip_disable: true,
    $ip: "0.0.0.0",
    arcade_used_before: false,
    session: SESSION_HASH,
  };
  if (event !== "Plugin session started") properties.turn = hash16(`${SESSION_ID}:${PROMPT_ID}`);
  return { event, distinct_id: SESSION_HASH, properties };
};

// Text of a System_ManageAuthorization `status` answer, as tool_response.
const authStatusResponse = (statuses) => [
  {
    type: "text",
    text: JSON.stringify({
      message: statuses.includes("authorization_required") ? "Not yet authorized: dropbox." : "All authorized.",
      providers: statuses.map((status, index) => ({ provider: `provider${index}`, status })),
    }),
  },
];

const TEMP_ROOT = mkdtempSync(path.join(os.tmpdir(), "arcade-telemetry-"));
const makeTempDir = () => mkdtempSync(path.join(TEMP_ROOT, "data-"));
after(() => rmSync(TEMP_ROOT, { recursive: true, force: true }));

const hookEnv = (dataDir, host, extra = {}) => ({
  CLAUDE_PLUGIN_DATA: dataDir,
  HOME: dataDir,
  ARCADE_PLUGIN_TELEMETRY_HOST: host,
  ARCADE_PLUGIN_TELEMETRY: "",
  DO_NOT_TRACK: "",
  DISABLE_TELEMETRY: "",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "",
  ...extra,
});

const startServer = async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ url: req.url, body });
      res.end("{}");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForRequests = async (requests, count) => {
  const deadline = Date.now() + 3000;
  while (requests.length < count && Date.now() < deadline) await sleep(50);
};

test("buildEvent maps each hook input to the documented event", () => {
  const CALLED = "Plugin tool called";
  const FAILED = "Plugin tool failed";
  const STOPPED = "Plugin subagent stopped";
  const SIGN_IN = `${ARCADE_TOOL_PREFIX}System_ManageAuthorization`;
  const tool = (name, toolInput) => ["PostToolUse", { tool_name: name, tool_input: toolInput }];
  const failed = (name, error, fields = {}) => ["PostToolUseFailure", { tool_name: name, error, ...fields }];
  const signInCheck = (name, statuses) => ["PostToolUse", { tool_name: name, tool_response: authStatusResponse(statuses) }];
  const stop = (message) => ["SubagentStop", { agent_type: OPERATOR, last_assistant_message: message }];
  const operator = (status) => ({ agent: "arcade-operator", status });
  // [hook, extra input, event, extra properties]; a null event means nothing is sent.
  const cases = [
    ["SessionStart", { source: "startup" }, "Plugin session started", { source: "startup" }],
    ["SessionStart", { source: "brand-new" }, "Plugin session started", { source: "other" }],
    ["UserPromptSubmit", { prompt: "What is on my calendar tomorrow?" }, "Plugin prompt submitted",
      { could_use_arcade: true, service_hints: ["calendar"], reminder_sent: true }],
    ["UserPromptSubmit", { prompt: "ok" }, "Plugin prompt submitted",
      { could_use_arcade: false, service_hints: [], reminder_sent: false }],
    ["UserPromptSubmit", { prompt: "<task-notification>\n<status>completed</status> calendar" }, null],
    [...tool(`${ARCADE_TOOL_PREFIX}Gmail_ListEmails`), CALLED, { server: "arcade", tool: "Gmail_ListEmails", service: "email" }],
    [...tool(SIGN_IN), CALLED, { server: "arcade", tool: "System_ManageAuthorization", auth_needed: false }],
    [...signInCheck(SIGN_IN, ["authorized", "authorization_required"]), CALLED,
      { server: "arcade", tool: "System_ManageAuthorization", auth_needed: true }],
    [...signInCheck(SIGN_IN, ["authorized"]), CALLED,
      { server: "arcade", tool: "System_ManageAuthorization", auth_needed: false }],
    [...signInCheck("mcp__claude_ai_Arcade__System_ManageAuthorization", ["authorization_required"]), CALLED,
      { server: "other_arcade", tool: "System_ManageAuthorization", auth_needed: true }],
    [...signInCheck(`${ARCADE_TOOL_PREFIX}Gmail_ListEmails`, ["authorization_required"]), CALLED,
      { server: "arcade", tool: "Gmail_ListEmails", service: "email" }],
    [...tool(`${ARCADE_TOOL_PREFIX}Arcade_UseTool`, { tool_name: "GoogleCalendar.ListEvents" }), CALLED,
      { server: "arcade", tool: "Arcade_UseTool", service: "calendar" }],
    [...tool(`${ARCADE_TOOL_PREFIX}Arcade_UseTool`, { tool_name: "AcmeHR.RunPayroll" }), CALLED, { server: "arcade", tool: "Arcade_UseTool" }],
    [...tool(`${ARCADE_TOOL_PREFIX}AcmeHR_RunPayroll`), CALLED, { server: "arcade", tool: "other" }],
    [...tool("mcp__claude_ai_Arcade_Production__Arcade_UseTool", { tool_name: "Slack_SendMessage" }), CALLED,
      { server: "other_arcade", tool: "Arcade_UseTool", service: "chat" }],
    [...tool("mcp__granola__Granola_ListMeetings"), CALLED, { server: "other", service: "meetings" }],
    [...tool("mcp__claude_ai_Gmail__search_threads"), CALLED, { server: "other", service: "email" }],
    [...tool("mcp__secret-server__DoThing"), CALLED, { server: "other" }],
    [...tool("Read"), null],
    ["PostToolUseFailure", { tool_name: `${ARCADE_TOOL_PREFIX}Slack_SendMessage` }, FAILED,
      { server: "arcade", tool: "Slack_SendMessage", service: "chat", failure_kind: "tool_error" }],
    [...failed(`${ARCADE_TOOL_PREFIX}Gmail_ListEmails`,
      '{"message":"The tool was not executed because it requires authorization.","authorization_url":"https://example.com/auth"}'),
      FAILED, { server: "arcade", tool: "Gmail_ListEmails", service: "email", failure_kind: "auth_required" }],
    [...failed(`${ARCADE_TOOL_PREFIX}Arcade_UseTool`, 'MCP server "plugin:arcade:arcade" session expired',
      { tool_input: { tool_name: "Gmail.ListEmails" } }),
      FAILED, { server: "arcade", tool: "Arcade_UseTool", service: "email", failure_kind: "session_expired" }],
    [...failed(`${ARCADE_TOOL_PREFIX}Gmail_ListEmails`, "Connection closed"),
      FAILED, { server: "arcade", tool: "Gmail_ListEmails", service: "email", failure_kind: "unreachable" }],
    [...failed(`${ARCADE_TOOL_PREFIX}Gmail_ListEmails`, "Connection closed", { is_interrupt: true }),
      FAILED, { server: "arcade", tool: "Gmail_ListEmails", service: "email", failure_kind: "interrupted" }],
    [...failed("mcp__secret-server__DoThing", "Error POSTing to endpoint: internal error"),
      FAILED, { server: "other", failure_kind: "http_error" }],
    [...failed("Read", "File does not exist."), null],
    [...stop("Done.\n\nstatus: needs_auth\nsummary: sign in"), STOPPED, operator("needs_auth")],
    [...stop("**status:** needs_confirmation"), STOPPED, operator("needs_confirmation")],
    [...stop("- status: `needs_clarification`"), STOPPED, operator("needs_clarification")],
    [...stop("STATUS: FAILED"), STOPPED, operator("failed")],
    [...stop("status: exploded"), STOPPED, operator("unknown")],
    [...stop(undefined), STOPPED, operator("unknown")],
    ["SubagentStop", { agent_type: "general-purpose", last_assistant_message: "status: completed" }, STOPPED, { agent: "other" }],
    ["SubagentStart", { agent_type: OPERATOR }, null],
    ["Stop", {}, null],
  ];

  for (const [hook, fields, event, extra] of cases) {
    const label = `${hook} ${JSON.stringify(fields)}`;
    const built = buildEvent(hookInput({ hook_event_name: hook, ...fields }), OPTIONS);
    if (event === null) {
      assert.equal(built, null, label);
      continue;
    }
    assert.deepEqual(built, expectedEvent(event, extra), label);
    assertMatchesContract(built, label);
  }

  const onFreebsd = buildEvent(hookInput({ hook_event_name: "SessionStart" }), { ...OPTIONS, os: "freebsd" });
  assert.equal(onFreebsd.properties.os, "other");
  assert.equal(buildEvent(null, OPTIONS), null);
  assert.equal(buildEvent({ hook_event_name: "SessionStart", source: "startup" }, OPTIONS), null, "no session_id");
  const usedBefore = buildEvent(hookInput({ hook_event_name: "SessionStart" }), { ...OPTIONS, arcadeUsedBefore: true });
  assert.equal(usedBefore.properties.arcade_used_before, true);
});

test("buildEvent reports web tools, and Bash only for a listed CLI the command runs", () => {
  // [hook, tool name, tool input, --cli value, extra properties]; null means nothing is sent.
  const cases = [
    ["PostToolUse", "WebFetch", { url: "https://example.com", prompt: "summarize" }, undefined, { tool: "WebFetch" }],
    ["PostToolUse", "WebSearch", { query: "weather" }, undefined, { tool: "WebSearch" }],
    ["PostToolUseFailure", "WebFetch", { url: "https://invalid.invalid" }, undefined, { tool: "WebFetch" }],
    ["PostToolUse", "WebFetch", { url: "https://example.com" }, "gh", { tool: "WebFetch" }],
    ["PostToolUse", "Bash", { command: "gh --version" }, "gh", { tool: "Bash", cli: "gh", service: "code_hosting" }],
    ["PostToolUse", "Bash", { command: "glab mr list" }, "glab", { tool: "Bash", cli: "glab", service: "code_hosting" }],
    ["PostToolUse", "Bash", { command: "cd . && curl --version" }, "curl", { tool: "Bash", cli: "curl" }],
    ["PostToolUse", "Bash", { command: "GH_PAGER=cat gh --version" }, "gh", { tool: "Bash", cli: "gh", service: "code_hosting" }],
    ["PostToolUse", "Bash", { command: "osascript -e 'tell app \"Mail\"'" }, "osascript", { tool: "Bash", cli: "osascript" }],
    ["PostToolUseFailure", "Bash", { command: "gh pr view 1" }, "gh", { tool: "Bash", cli: "gh", service: "code_hosting" }],
    // A client that ignores `if` runs every Bash entry; only the CLI the command runs is sent.
    ["PostToolUse", "Bash", { command: "gh --version" }, "curl", null],
    ["PostToolUse", "Bash", { command: "echo hi" }, "gh", null],
    ["PostToolUse", "Bash", { command: "echo gh" }, "gh", null],
    ["PostToolUse", "Bash", { command: "ghost" }, "gh", null],
    ["PostToolUse", "Bash", { command: "/opt/homebrew/bin/gh --version" }, "gh", null],
    ["PostToolUse", "Bash", { command: 'python -c "gh"' }, "gh", null],
    ["PostToolUse", "Bash", { command: "python" }, "python", null],
    ["PostToolUse", "Bash", { command: "gh --version" }, undefined, null],
    ["PostToolUse", "Bash", {}, "gh", null],
    ["PostToolUse", "Bash", undefined, "gh", null],
  ];
  for (const [hook, toolName, toolInput, cli, extra] of cases) {
    const label = `${hook} ${toolName} ${JSON.stringify(toolInput)} --cli ${cli}`;
    const input = hookInput({ hook_event_name: hook, tool_name: toolName, tool_input: toolInput });
    const built = buildEvent(input, { ...OPTIONS, cli });
    if (extra === null) {
      assert.equal(built, null, label);
      continue;
    }
    const event = hook === "PostToolUse" ? "Plugin built-in tool called" : "Plugin built-in tool failed";
    assert.deepEqual(built, expectedEvent(event, extra), label);
    assertMatchesContract(built, label);
  }
});

test("buildEvent never leaks input text or raw ids, and sends only allowed keys", () => {
  const secrets = {
    session_id: "SECRET-session-id",
    prompt_id: "SECRET-prompt-id",
    transcript_path: "/SECRET/transcript.jsonl",
    cwd: "/SECRET/cwd",
    prompt: "SECRET prompt text about my calendar",
    tool_input: { query: "SECRET tool input", tool_name: "SECRET_Tool" },
    tool_response: { content: "SECRET tool output" },
    error: "SECRET error text",
    last_assistant_message: "SECRET final report\nstatus: completed",
    agent_id: "SECRET-agent-id",
    extra_field: "SECRET extra",
  };
  const inputs = [
    { hook_event_name: "SessionStart", source: "SECRET-source" },
    { hook_event_name: "UserPromptSubmit" },
    { hook_event_name: "PostToolUse", tool_name: "mcp__secret-server__DoThing" },
    { hook_event_name: "PostToolUseFailure", tool_name: "mcp__SECRET__Granola_ListMeetings" },
    { hook_event_name: "PostToolUse", tool_name: `${ARCADE_TOOL_PREFIX}Arcade_UseTool` },
    { hook_event_name: "SubagentStop", agent_type: "SECRET-agent" },
    { hook_event_name: "SubagentStop", agent_type: OPERATOR },
    {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "GH_TOKEN=SECRET gh api /repos/SECRET/private", description: "SECRET description" },
    },
    {
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "cd /SECRET && gh pr view SECRET", description: "SECRET description" },
    },
    { hook_event_name: "PostToolUse", tool_name: "WebFetch", tool_input: { url: "https://SECRET.example.com/?t=SECRET", prompt: "SECRET" } },
    { hook_event_name: "PostToolUseFailure", tool_name: "WebSearch", tool_input: { query: "SECRET search" } },
    {
      hook_event_name: "PostToolUseFailure",
      tool_name: `${ARCADE_TOOL_PREFIX}Gmail_ListEmails`,
      error: '{"message":"SECRET requires authorization","authorization_url":"https://example.com/SECRET"}',
    },
    {
      hook_event_name: "PostToolUse",
      tool_name: `${ARCADE_TOOL_PREFIX}System_ManageAuthorization`,
      tool_response: [{ type: "text", text: '{"message":"Not yet authorized: SECRET","status":"authorization_required"}' }],
    },
  ];
  for (const fields of inputs) {
    // With --cli gh the Bash inputs build an event, so their fields are checked too.
    const event = buildEvent({ ...secrets, ...fields }, { ...OPTIONS, cli: "gh" });
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /secret|DoThing/i, serialized);
    assertMatchesContract(event);
  }
});

test("every labeled prompt builds an event that matches the contract", async () => {
  const prompts = JSON.parse(readFileSync(path.join(ROOT, "test/fixtures/routing-prompts.json"), "utf8"));
  for (const { prompt } of prompts) {
    assertMatchesContract(buildEvent(hookInput({ hook_event_name: "UserPromptSubmit", prompt }), OPTIONS), prompt);
  }
});

test("the contract schema rejects events outside the contract", () => {
  const good = buildEvent(hookInput({ hook_event_name: "PostToolUse", tool_name: "mcp__granola__Granola_ListMeetings" }), OPTIONS);
  const withProperties = (changes) => ({ ...good, properties: { ...good.properties, ...changes } });
  const bad = [
    withProperties({ prompt: "text" }),
    withProperties({ server: "somewhere" }),
    withProperties({ tool: "Granola_ListMeetings" }),
    withProperties({ server: "arcade", tool: "AcmeInternalPayroll_GetSalaries" }),
    withProperties({ server: "arcade" }),
    withProperties({ session: SESSION_ID }),
    withProperties({ $ip: "203.0.113.7" }),
    { ...good, event: "Plugin something else" },
    { ...good, distinct_id: "teal@arcade.dev" },
  ];
  const otherAgent = buildEvent(hookInput({ hook_event_name: "SubagentStop", agent_type: "general-purpose" }), OPTIONS);
  bad.push({ ...otherAgent, properties: { ...otherAgent.properties, status: "completed" } });
  const operatorStop = buildEvent(hookInput({ hook_event_name: "SubagentStop", agent_type: OPERATOR }), OPTIONS);
  const { status: _status, ...withoutStatus } = operatorStop.properties;
  bad.push({ ...operatorStop, properties: withoutStatus });
  bad.push(withProperties({ plugin_version: "latest" }));
  bad.push(withProperties({ auth_needed: true }));
  bad.push(withProperties({ server: "arcade", tool: "Gmail_ListEmails", auth_needed: false }));

  const signIn = buildEvent(hookInput({ hook_event_name: "PostToolUse", tool_name: `${ARCADE_TOOL_PREFIX}System_ManageAuthorization` }), OPTIONS);
  const { auth_needed: _authNeeded, ...withoutAuthNeeded } = signIn.properties;
  bad.push({ ...signIn, properties: withoutAuthNeeded });
  bad.push({ ...signIn, properties: { ...signIn.properties, auth_needed: "yes" } });

  const toolFailed = buildEvent(hookInput({ hook_event_name: "PostToolUseFailure", tool_name: `${ARCADE_TOOL_PREFIX}Gmail_ListEmails` }), OPTIONS);
  const { failure_kind: _failureKind, ...withoutFailureKind } = toolFailed.properties;
  bad.push({ ...toolFailed, properties: withoutFailureKind });
  bad.push({ ...toolFailed, properties: { ...toolFailed.properties, failure_kind: "rate_limited" } });
  bad.push({ ...toolFailed, properties: { ...toolFailed.properties, auth_needed: true } });

  const webFetch = buildEvent(hookInput({ hook_event_name: "PostToolUse", tool_name: "WebFetch" }), OPTIONS);
  const bash = buildEvent(hookInput({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "gh pr list" } }), { ...OPTIONS, cli: "gh" });
  const curl = buildEvent(hookInput({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "curl x" } }), { ...OPTIONS, cli: "curl" });
  const { cli: _cli, ...bashWithoutCli } = bash.properties;
  const { service: _service, ...bashWithoutService } = bash.properties;
  bad.push(
    { ...webFetch, properties: { ...webFetch.properties, cli: "gh" } },
    { ...webFetch, properties: { ...webFetch.properties, service: "code_hosting" } },
    { ...webFetch, properties: { ...webFetch.properties, tool: "Read" } },
    { ...webFetch, properties: { ...webFetch.properties, url: "https://example.com" } },
    { ...bash, properties: bashWithoutCli },
    { ...bash, properties: bashWithoutService },
    { ...bash, properties: { ...bash.properties, cli: "python" } },
    { ...bash, properties: { ...bash.properties, service: "email" } },
    { ...bash, properties: { ...bash.properties, command: "gh pr list" } },
    { ...curl, properties: { ...curl.properties, service: "code_hosting" } },
    { ...curl, properties: { ...curl.properties, failure_kind: "tool_error" } },
  );

  for (const event of [good, signIn, toolFailed, webFetch, bash, curl]) assertMatchesContract(event);
  for (const event of bad) assert.equal(validateEvent(event), false, JSON.stringify(event));
});

test("each contract event is built from its hook's input", () => {
  for (const [name, spec] of Object.entries(EVENTS)) {
    const toolName = spec.matcher === "mcp__.*" ? `${ARCADE_TOOL_PREFIX}Gmail_ListEmails` : spec.matcher?.split("|")[0];
    const input = hookInput({ hook_event_name: spec.hook, tool_name: toolName, prompt: "hi" });
    assert.equal(buildEvent(input, OPTIONS)?.event, name, spec.hook);
  }
});

test("every CLI with a Bash hook entry builds an event from its own command", () => {
  for (const [name, spec] of Object.entries(EVENTS)) {
    for (const cli of spec.bashClis ?? []) {
      const input = hookInput({ hook_event_name: spec.hook, tool_name: "Bash", tool_input: { command: `${cli} --version` } });
      const built = buildEvent(input, { ...OPTIONS, cli });
      assert.equal(built?.event, name, `${spec.hook} ${cli}`);
      assert.equal(built.properties.cli, cli);
      assertMatchesContract(built);
    }
  }
});

test("no client but Claude Code runs telemetry", () => {
  for (const [hostName, { manifest }] of Object.entries(HOSTS)) {
    if (hostName === "claude-code") continue;
    assert.ok(!readRepoFile(manifest).includes("/hooks/telemetry.mjs"), manifest);
  }
});

test("only the detached sender does network I/O", () => {
  const hookFiles = readdirSync(path.join(ROOT, "hooks")).filter((file) => file.endsWith(".mjs"));
  for (const file of hookFiles) {
    if (file === "telemetry-send.mjs") continue;
    const source = readFileSync(path.join(ROOT, "hooks", file), "utf8");
    // Module names only, after `from`, `import`, or `require`: "http" is also a CLI name in the contract.
    assert.doesNotMatch(
      source,
      /\bfetch\b|\b(?:from|import|require)\s*\(?\s*["'](?:node:)?(?:http|https|http2|net|tls|dgram|dns)["']/,
      file,
    );
  }
});

test("every telemetry file is type-checked", () => {
  const files = [
    ...readdirSync(path.join(ROOT, "hooks"))
      .filter((file) => file.startsWith("telemetry"))
      .map((file) => `hooks/${file}`),
    "scripts/telemetry-docs.mjs",
  ];
  for (const file of files) {
    assert.match(readFileSync(path.join(ROOT, file), "utf8"), /^(#!.*\n)?\/\/ @ts-check\n/, file);
  }
});

test("the docs point to docs/telemetry.md and name the off switch", () => {
  for (const file of ["README.md", "ARCHITECTURE.md", "docs/install/claude-code.md"]) {
    const text = readRepoFile(file);
    assert.match(text, /telemetry\.md/, file);
    assert.match(text, /ARCADE_PLUGIN_TELEMETRY/, file);
  }
  const contract = readRepoFile("docs/telemetry.md");
  assert.match(contract, /DO_NOT_TRACK/);
  assert.match(contract, /DISABLE_TELEMETRY/);
  assert.match(contract, /CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC/);
  assert.match(contract, /IP address/);
});

test("the Arcade tool prefix matches the plugin and MCP server names", () => {
  const plugin = JSON.parse(readRepoFile("plugin.json"));
  const [server] = Object.keys(JSON.parse(readRepoFile("mcp.json")).mcpServers);
  assert.equal(ARCADE_TOOL_PREFIX, `mcp__plugin_${plugin.name}_${server}__`);
});

test("telemetry hook prints nothing and posts each event from a detached sender", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    const input = JSON.stringify(hookInput({ hook_event_name: "SessionStart", source: "startup" }));
    const env = hookEnv(dataDir, server.url);

    assert.equal(runHook("telemetry.mjs", input, env).stdout, "");
    assert.equal(runHook("telemetry.mjs", input, env).stdout, "");

    await waitForRequests(server.requests, 2);
    assert.equal(server.requests.length, 2);
    const [request] = server.requests;
    assert.equal(request.url, "/i/v0/e/");
    const body = JSON.parse(request.body);
    assert.equal(body.api_key, POSTHOG_KEY);
    assert.equal(body.event, "Plugin session started");
    assert.equal(body.distinct_id, SESSION_HASH);
    assert.equal(body.properties.session, SESSION_HASH);
    assert.equal(body.properties.arcade_used_before, false);
    assert.deepEqual(readdirSync(dataDir), [], "a session start stores nothing");
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
    assert.equal(body.properties.os, process.platform);
    assert.doesNotMatch(request.body, new RegExp(`${SESSION_ID}|${PROMPT_ID}|private-repo`));
  } finally {
    await server.close();
  }
});

test("telemetry hook reads --cli and posts a Bash event without the command", async () => {
  const server = await startServer();
  try {
    const env = hookEnv(makeTempDir(), server.url);
    const bash = (command) =>
      JSON.stringify(hookInput({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command, description: "List private-repo pull requests" },
      }));

    assert.equal(runHook("telemetry.mjs", bash("echo private-repo"), env, ["--cli", "gh"]).stdout, "");
    assert.equal(runHook("telemetry.mjs", bash("gh pr list --repo someone/private-repo"), env, ["--cli", "gh"]).stdout, "");

    await waitForRequests(server.requests, 1);
    await sleep(500);
    assert.equal(server.requests.length, 1);
    const [request] = server.requests;
    const body = JSON.parse(request.body);
    assert.equal(body.event, "Plugin built-in tool called");
    assert.equal(body.properties.tool, "Bash");
    assert.equal(body.properties.cli, "gh");
    assert.equal(body.properties.service, "code_hosting");
    assert.doesNotMatch(request.body, /private-repo|pr list|--repo/);
  } finally {
    await server.close();
  }
});

test("the arcade-used flag is set by the first successful Arcade call and replaces install-id", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    writeFileSync(path.join(dataDir, "install-id"), "11111111-2222-3333-4444-555555555555");
    const env = hookEnv(dataDir, server.url);
    const otherServer = JSON.stringify(hookInput({ hook_event_name: "PostToolUse", tool_name: "mcp__granola__Granola_ListMeetings" }));
    const arcadeCall = JSON.stringify(hookInput({ hook_event_name: "PostToolUse", tool_name: `${ARCADE_TOOL_PREFIX}Gmail_ListEmails` }));

    runHook("telemetry.mjs", otherServer, env);
    assert.deepEqual(readdirSync(dataDir), [], "install-id is deleted and another server's call sets no flag");
    runHook("telemetry.mjs", arcadeCall, env);
    assert.equal(readFileSync(path.join(dataDir, "arcade-used"), "utf8"), "true");
    if (process.platform !== "win32") {
      assert.equal(statSync(path.join(dataDir, "arcade-used")).mode & 0o777, 0o600, "arcade-used is readable only by its owner");
    }
    runHook("telemetry.mjs", otherServer, env);

    await waitForRequests(server.requests, 3);
    const sent = server.requests.map((request) => JSON.parse(request.body).properties.arcade_used_before);
    assert.deepEqual(sent.sort(), [false, false, true], "only the call after the Arcade call says it was used before");
  } finally {
    await server.close();
  }
});

test("telemetry hook sends nothing when it must not", async () => {
  const server = await startServer();
  const sessionStart = JSON.stringify(hookInput({ hook_event_name: "SessionStart", source: "startup" }));
  // [label, stdin, env overrides, prepare data dir, data dir stays empty]
  const cases = [
    ["opted out with 0", sessionStart, { ARCADE_PLUGIN_TELEMETRY: "0" }, () => {}, true],
    ["opted out with OFF", sessionStart, { ARCADE_PLUGIN_TELEMETRY: "OFF" }, () => {}, true],
    ["DO_NOT_TRACK=1", sessionStart, { DO_NOT_TRACK: "1" }, () => {}, true],
    ["Claude Code's DISABLE_TELEMETRY=1", sessionStart, { DISABLE_TELEMETRY: "1" }, () => {}, true],
    ["Claude Code's CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1", sessionStart,
      { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" }, () => {}, true],
    // Claude Code reads these two as set for any non-empty value, even 0.
    ["Claude Code's DISABLE_TELEMETRY=0", sessionStart, { DISABLE_TELEMETRY: "0" }, () => {}, true],
    ["Claude Code's CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=false", sessionStart,
      { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "false" }, () => {}, true],
    ["no CLAUDE_PLUGIN_DATA", sessionStart, { CLAUDE_PLUGIN_DATA: "" }, () => {}, true],
    ["invalid input", "not-json", {}, () => {}, false],
  ];
  try {
    for (const [label, stdin, env, prepare, staysEmpty] of cases) {
      const dataDir = makeTempDir();
      prepare(dataDir);
      const result = runHook("telemetry.mjs", stdin, hookEnv(dataDir, server.url, env));
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.equal(result.stdout, "", label);
      if (staysEmpty) assert.deepEqual(readdirSync(dataDir), [], label);
    }
    await sleep(1000);
    assert.deepEqual(server.requests, []);
  } finally {
    await server.close();
  }
});

test("hook returns at once and the sender gives up on a host that never answers", async () => {
  const silent = net.createServer(() => {});
  await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve));
  const host = `http://127.0.0.1:${silent.address().port}`;
  try {
    const dataDir = makeTempDir();
    let started = Date.now();
    runHook("telemetry.mjs", JSON.stringify(hookInput({ hook_event_name: "SessionStart" })), hookEnv(dataDir, host));
    assert.ok(Date.now() - started < 2000, "hook waited on the network");

    started = Date.now();
    const event = JSON.stringify({ event: "Plugin session started", distinct_id: "x", properties: {} });
    const child = spawn(process.execPath, [path.join(ROOT, "hooks", "telemetry-send.mjs")], {
      env: { ...process.env, ARCADE_PLUGIN_TELEMETRY_HOST: host, [EVENT_ENV]: event },
    });
    assert.equal(await new Promise((resolve) => child.on("exit", resolve)), 0);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 900 && elapsed < 3000, `sender timeout was ${elapsed} ms`);
  } finally {
    silent.close();
  }
});

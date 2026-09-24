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
import { HOOKS, HOSTS } from "../hooks/hook-hosts.mjs";
import { ARCADE_TOOL_PREFIX, COPILOT_ARCADE_SERVER, EVENTS, eventSchema, TELEMETRY_HOSTS } from "../hooks/telemetry-contract.mjs";
import { buildEvent, HOST_INPUT } from "../hooks/telemetry-events.mjs";
import { EVENT_ENV, PLUGIN_VERSION, POSTHOG_KEY } from "../hooks/telemetry-config.mjs";

const OPTIONS = { host: "claude-code", os: "darwin", arcadeUsedBefore: false };
const COPILOT_OPTIONS = { ...OPTIONS, host: "copilot-cli" };
const SESSION_ID = "raw-session-id-123";
const PROMPT_ID = "raw-prompt-id-456";
const OPERATOR = "arcade:arcade-operator";

const validateEvent = new Ajv2020({ allErrors: true }).compile(eventSchema());
const assertMatchesContract = (event, label = JSON.stringify(event)) => {
  assert.equal(validateEvent(event), true, `${label}: ${JSON.stringify(validateEvent.errors)}`);
};

// Runs telemetry.mjs the way hooks.json does, with the given environment.
const runHook = (script, stdin, env, hostName = "claude-code", extraArgs = []) =>
  spawnSync(process.execPath, [path.join(ROOT, "hooks", script), "--host", hostName, ...extraArgs], {
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
  COPILOT_PLUGIN_DATA: "",
  COPILOT_OFFLINE: "",
  ...extra,
});

const copilotEnv = (dataDir, host, extra = {}) =>
  hookEnv(dataDir, host, { CLAUDE_PLUGIN_DATA: "", COPILOT_PLUGIN_DATA: dataDir, ...extra });

// Copilot CLI hook input, with the keys measured from copilot 1.0.88.
const COPILOT_SESSION_ID = "dd3beb80-4471-4513-99a4-a57d3d7c08df";
const COPILOT_SUBAGENT_ID = "57946be7-1a73-40ca-a042-abb0f68d9445";
const copilotInput = (fields) => ({
  session_id: COPILOT_SESSION_ID,
  timestamp: "2026-09-24T21:27:02.743Z",
  cwd: "/Users/someone/private-repo",
  ...fields,
});

// Every telemetry hook entry in a generated manifest, nested or flat.
const telemetryCommands = (manifest) =>
  Object.values(JSON.parse(readRepoFile(manifest)).hooks)
    .flatMap((entries) => entries.flatMap((entry) => entry.hooks ?? [entry]))
    .map((hook) => hook.command)
    .filter((command) => command.includes("/hooks/telemetry.mjs"));

const telemetryHostNames = () => Object.keys(HOSTS).filter((name) => HOSTS[name].telemetry);

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

const POWERSHELL = (process.platform === "win32" ? ["pwsh", "powershell.exe"] : ["pwsh"]).find(
  (exe) => !spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"]).error,
);

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
    ["SubagentStop", { agent_type: OPERATOR, agent_id: "agent-1", last_assistant_message: "status: completed" }, STOPPED, operator("completed")],
    ["SubagentStop", { agent_type: "general-purpose", agent_id: "agent-2" }, STOPPED, { agent: "other" }],
    ["SubagentStop", { agent_type: "general-purpose", agent_id: "" }, STOPPED, { agent: "other" }],
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
  for (const host of ["cursor", "copilot", "toString", ""]) {
    assert.equal(buildEvent(hookInput({ hook_event_name: "SessionStart" }), { ...OPTIONS, host }), null, `host ${host}`);
  }
  const ccStop = buildEvent(hookInput({ hook_event_name: "SubagentStop", agent_type: OPERATOR, agent_id: "agent-x" }), OPTIONS);
  assert.equal(ccStop.properties.subagent_session, undefined, "Claude Code SubagentStop has no subagent_session");
});

test("buildEvent maps Copilot CLI hook input to the documented event", () => {
  const CALLED = "Plugin tool called";
  const FAILED = "Plugin tool failed";
  const STOPPED = "Plugin subagent stopped";
  const result = { result_type: "success", text_result_for_llm: '["Gmail","Slack","Calendar"]' };
  const tool = (name, toolInput = {}) => ["PostToolUse", { tool_name: name, tool_input: toolInput, tool_result: result }];
  const stop = (fields) => ["SubagentStop", {
    transcript_path: `/Users/someone/.copilot/session-state/${COPILOT_SESSION_ID}/events.jsonl`,
    agent_id: COPILOT_SUBAGENT_ID,
    agent_type: OPERATOR,
    agent_name: OPERATOR,
    agent_display_name: "arcade-operator",
    stop_reason: "end_turn",
    ...fields,
  }];
  const subagentSession = hash16(COPILOT_SUBAGENT_ID);
  // [hook, extra input, event, extra properties]; a null event means nothing is sent.
  const cases = [
    ["SessionStart", { source: "new", initial_prompt: "Call the arcade list_apps tool." }, "Plugin session started", { source: "new" }],
    ["SessionStart", { source: "startup" }, "Plugin session started", { source: "startup" }],
    ["UserPromptSubmit", { prompt: "What is on my calendar tomorrow?" }, "Plugin prompt submitted",
      { could_use_arcade: true, service_hints: ["calendar"], reminder_sent: false }],
    [...tool("arcade-Gmail_ListEmails"), CALLED, { server: "arcade", tool: "Gmail_ListEmails", service: "email" }],
    [...tool("arcade-Arcade_UseTool", { tool_name: "GoogleCalendar.ListEvents" }), CALLED,
      { server: "arcade", tool: "Arcade_UseTool", service: "calendar" }],
    [...tool("arcade-AcmeHR_RunPayroll"), CALLED, { server: "arcade", tool: "other" }],
    [...tool("arcade-list_apps", { q: "" }), CALLED, { server: "arcade", tool: "other" }],
    [...tool("arcade-staging-Arcade_UseTool"), CALLED, { server: "other_arcade", tool: "Arcade_UseTool" }],
    [...tool("granola-Granola_ListMeetings"), CALLED, { server: "other", service: "meetings" }],
    [...tool("github-mcp-server-get_issue"), CALLED, { server: "other", service: "code_hosting" }],
    [...tool("secret-server-DoThing"), CALLED, { server: "other" }],
    [...tool("Bash", { command: "echo done" }), null],
    [...tool("Agent", { agent_type: OPERATOR }), null],
    [...tool("-Gmail_ListEmails"), null],
    [...tool("arcade-"), null],
    ["PostToolUseFailure", { tool_name: "arcade-error_tool", tool_input: {},
      error: "MCP server 'arcade': Something went wrong in the upstream service" }, FAILED,
      { server: "arcade", tool: "other", failure_kind: "tool_error" }],
    ["PostToolUseFailure", { tool_name: "arcade-die_tool", tool_input: {},
      error: "MCP server 'arcade': MCP request failed: MCP transport closed before the tool responded" }, FAILED,
      { server: "arcade", tool: "other", failure_kind: "tool_error" }],
    ["PostToolUseFailure", { tool_name: "arcade-Slack_SendMessage", tool_input: {},
      error: "MCP server 'arcade': Slack requires authorization" }, FAILED,
      { server: "arcade", tool: "Slack_SendMessage", service: "chat", failure_kind: "auth_required" }],
    ["PostToolUse", { tool_name: "arcade-System_ManageAuthorization", tool_input: {}, tool_result: {
      result_type: "success", text_result_for_llm: '{"providers":[{"status":"authorization_required"}]}' } }, CALLED,
      { server: "arcade", tool: "System_ManageAuthorization", auth_needed: true }],
    [...tool("arcade-System_ManageAuthorization"), CALLED,
      { server: "arcade", tool: "System_ManageAuthorization", auth_needed: false }],
    [...tool("Bash", { command: "gh pr list" }), null],
    [...stop({ last_assistant_message: "Completed: I used arcade-list_apps once.\n\nNo blockers or questions." }), STOPPED,
      { agent: "arcade-operator", status: "unknown", subagent_session: subagentSession }],
    [...stop({ last_assistant_message: "Done.\n\nstatus: completed" }), STOPPED,
      { agent: "arcade-operator", status: "completed", subagent_session: subagentSession }],
    [...stop({ agent_type: "general-purpose", agent_name: "general-purpose" }), STOPPED,
      { agent: "other", subagent_session: subagentSession }],
    ["PreToolUse", { tool_name: "arcade-list_apps", tool_input: {} }, null],
    ["Stop", { stop_reason: "end_turn", stop_hook_active: false }, null],
  ];

  const session = hash16(COPILOT_SESSION_ID);
  for (const [hook, fields, event, extra] of cases) {
    const label = `${hook} ${JSON.stringify(fields)}`;
    const built = buildEvent(copilotInput({ hook_event_name: hook, ...fields }), COPILOT_OPTIONS);
    if (event === null) {
      assert.equal(built, null, label);
      continue;
    }
    const properties = {
      ...extra,
      host: "copilot-cli",
      plugin_version: PLUGIN_VERSION,
      os: "darwin",
      $process_person_profile: false,
      $geoip_disable: true,
      $ip: "0.0.0.0",
      arcade_used_before: false,
      session,
    };
    assert.deepEqual(built, { event, distinct_id: session, properties }, label);
    assertMatchesContract(built, label);
  }

  // SubagentStart sends camelCase keys and no hook_event_name.
  const subagentStart = {
    sessionId: COPILOT_SESSION_ID,
    timestamp: 1790285282793,
    cwd: "/Users/someone/private-repo",
    agentName: OPERATOR,
    agentDisplayName: "arcade-operator",
  };
  assert.equal(buildEvent(subagentStart, COPILOT_OPTIONS), null);

  // The subagent's own events carry its session ID, which the parent's
  // SubagentStop names as agent_id.
  const subagentPrompt = buildEvent(
    copilotInput({ hook_event_name: "UserPromptSubmit", session_id: COPILOT_SUBAGENT_ID, prompt: "Complete todo listing-arcade-apps" }),
    COPILOT_OPTIONS,
  );
  const [, stopFields] = stop({ last_assistant_message: "status: completed" });
  const parentStop = buildEvent(copilotInput({ hook_event_name: "SubagentStop", ...stopFields }), COPILOT_OPTIONS);
  assert.equal(parentStop.properties.subagent_session, subagentPrompt.properties.session);
  assert.notEqual(parentStop.properties.session, subagentPrompt.properties.session);
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

test("buildEvent never leaks Copilot CLI input text or raw ids", () => {
  const secrets = {
    session_id: "SECRET-session-id",
    timestamp: "2026-09-24T21:27:02.743Z",
    cwd: "/SECRET/cwd",
    transcript_path: "/SECRET/session-state/events.jsonl",
    prompt: "SECRET prompt text about my calendar",
    initial_prompt: "SECRET initial prompt about my calendar",
    tool_input: { query: "SECRET tool input", tool_name: "SECRET_Tool" },
    tool_result: { result_type: "success", text_result_for_llm: "SECRET tool output" },
    error: "MCP server 'SECRET': SECRET error text",
    agent_id: "SECRET-agent-id",
    agent_name: "SECRET-agent-name",
    agent_display_name: "SECRET agent",
    last_assistant_message: "SECRET final report\nstatus: completed",
    stop_reason: "SECRET",
  };
  const inputs = [
    { hook_event_name: "SessionStart", source: "SECRET-source" },
    { hook_event_name: "UserPromptSubmit" },
    { hook_event_name: "PostToolUse", tool_name: "SECRET-server-DoThing" },
    { hook_event_name: "PostToolUse", tool_name: "SECRET-Granola_ListMeetings" },
    { hook_event_name: "PostToolUseFailure", tool_name: "SECRET-Arcade_UseTool" },
    { hook_event_name: "PostToolUse", tool_name: "arcade-SECRET_Tool" },
    { hook_event_name: "PostToolUse", tool_name: "arcade-Arcade_UseTool" },
    { hook_event_name: "SubagentStop", agent_type: "SECRET-agent" },
    { hook_event_name: "SubagentStop", agent_type: OPERATOR },
  ];
  for (const fields of inputs) {
    const event = buildEvent({ ...secrets, ...fields }, COPILOT_OPTIONS);
    assert.notEqual(event, null, JSON.stringify(fields));
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
  const arcadeTools = { "claude-code": `${ARCADE_TOOL_PREFIX}Gmail_ListEmails`, "copilot-cli": `${COPILOT_ARCADE_SERVER}-Gmail_ListEmails` };
  for (const host of TELEMETRY_HOSTS) {
    for (const [name, spec] of Object.entries(EVENTS)) {
      if (spec.claudeCodeOnly && host !== "claude-code") continue;
      const toolName = spec.mcpToolsOnly ? arcadeTools[host] : spec.matcher?.split("|")[0];
      const input = hookInput({ hook_event_name: spec.hook, tool_name: toolName, prompt: "hi" });
      assert.equal(buildEvent(input, { ...OPTIONS, host })?.event, name, `${host} ${spec.hook}`);
    }
  }
});

test("Copilot CLI sends no built-in tool events", () => {
  const webFetch = hookInput({ hook_event_name: "PostToolUse", tool_name: "WebFetch" });
  const gh = hookInput({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "gh pr list" } });
  assert.equal(buildEvent(webFetch, COPILOT_OPTIONS), null);
  assert.equal(buildEvent(gh, { ...COPILOT_OPTIONS, cli: "gh" }), null);
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

test("every generated telemetry command runs and exits quietly with telemetry off", () => {
  for (const hostName of telemetryHostNames()) {
    const { manifest, rootVariable } = HOSTS[hostName];
    const commands = telemetryCommands(manifest);
    const rows = HOOKS.filter((hook) => hook.script === "telemetry.mjs" && hook.hosts?.includes(hostName));
    assert.equal(commands.length, rows.length, manifest);
    for (const command of commands) {
      const result = spawnSync(command.replaceAll(`\${${rootVariable}}`, ROOT), {
        shell: true,
        input: JSON.stringify(hookInput({ hook_event_name: "SessionStart" })),
        encoding: "utf8",
        env: { ...process.env, ARCADE_PLUGIN_TELEMETRY: "0" },
      });
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.equal(result.stdout, "", command);
    }
  }
});

test("exactly the hosts with a telemetry entry run telemetry", () => {
  assert.ok(!HOSTS.cursor.telemetry, "Cursor's hook input carries the user's email");
  for (const [hostName, { manifest, telemetry }] of Object.entries(HOSTS)) {
    const commands = telemetryCommands(manifest);
    assert.equal(commands.length > 0, Boolean(telemetry), manifest);
    for (const command of commands) assert.ok(command.includes(`--host ${hostName}`), command);
  }
});

test("each client's telemetry host is a contract host, and each contract host has a client", () => {
  const clientHosts = telemetryHostNames().map((name) => HOSTS[name].telemetry.host);
  assert.deepEqual([...clientHosts].sort(), [...TELEMETRY_HOSTS].sort());
  assert.deepEqual(Object.keys(HOST_INPUT).sort(), [...TELEMETRY_HOSTS].sort());
});

test("only clients that run the prompt hook report a reminder", () => {
  for (const hostName of telemetryHostNames()) {
    const { manifest, telemetry } = HOSTS[hostName];
    const runsPromptHook = readRepoFile(manifest).includes("/hooks/user-prompt-submit.mjs");
    assert.equal(HOST_INPUT[telemetry.host].promptReminder, runsPromptHook, hostName);
  }
});

test("the Copilot MCP tool matcher picks out server tools, not built-in ones", () => {
  // Copilot CLI compiles a matcher as ^(?:matcher)$ against the tool name.
  const matcher = new RegExp(`^(?:${HOSTS.copilot.mcpToolMatcher})$`);
  for (const name of ["arcade-Arcade_UseTool", "github-mcp-server-get_issue"]) assert.match(name, matcher);
  for (const name of ["Bash", "Agent", "view"]) assert.doesNotMatch(name, matcher);
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
  assert.match(contract, /COPILOT_OFFLINE/);
  const copilotInstall = readRepoFile("docs/install/copilot.md");
  assert.match(copilotInstall, /telemetry\.md/);
  assert.match(copilotInstall, /ARCADE_PLUGIN_TELEMETRY/);
});

test("the Arcade tool prefix matches the plugin and MCP server names", () => {
  const plugin = JSON.parse(readRepoFile("plugin.json"));
  const [server] = Object.keys(JSON.parse(readRepoFile("mcp.json")).mcpServers);
  assert.equal(ARCADE_TOOL_PREFIX, `mcp__plugin_${plugin.name}_${server}__`);
  assert.equal(COPILOT_ARCADE_SERVER, server);
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

    assert.equal(runHook("telemetry.mjs", bash("echo private-repo"), env, "claude-code", ["--cli", "gh"]).stdout, "");
    assert.equal(runHook("telemetry.mjs", bash("gh pr list --repo someone/private-repo"), env, "claude-code", ["--cli", "gh"]).stdout, "");

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
    ["opted out, with an old install-id to delete", sessionStart, { ARCADE_PLUGIN_TELEMETRY: "0" },
      (dir) => writeFileSync(path.join(dir, "install-id"), "11111111-2222-3333-4444-555555555555"), true],
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
    ["relative CLAUDE_PLUGIN_DATA", sessionStart, { CLAUDE_PLUGIN_DATA: "relative/data" }, () => {}, true],
    ["only COPILOT_PLUGIN_DATA", sessionStart, { CLAUDE_PLUGIN_DATA: "", COPILOT_PLUGIN_DATA: os.tmpdir() }, () => {}, true],
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

test("Copilot telemetry hook posts events and keeps arcade-used in COPILOT_PLUGIN_DATA", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    const arcadeCall = JSON.stringify(copilotInput({
      hook_event_name: "PostToolUse",
      tool_name: "arcade-Gmail_ListEmails",
      tool_input: {},
      tool_result: { result_type: "success", text_result_for_llm: "private inbox" },
    }));
    const sessionStart = JSON.stringify(copilotInput({ hook_event_name: "SessionStart", source: "new", initial_prompt: "private prompt" }));

    const first = runHook("telemetry.mjs", arcadeCall, copilotEnv(dataDir, server.url), "copilot");
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, "");
    assert.equal(readFileSync(path.join(dataDir, "arcade-used"), "utf8"), "true");
    // Claude Code's switches don't apply to Copilot, and COPILOT_OFFLINE off values leave it on.
    for (const extra of [{ COPILOT_OFFLINE: "false" }, { COPILOT_OFFLINE: "0" }, { DISABLE_TELEMETRY: "1" }]) {
      const result = runHook("telemetry.mjs", sessionStart, copilotEnv(dataDir, server.url, extra), "copilot");
      assert.equal(result.stdout, "", JSON.stringify(extra));
    }

    await waitForRequests(server.requests, 4);
    assert.equal(server.requests.length, 4);
    const bodies = server.requests.map((request) => JSON.parse(request.body));
    for (const body of bodies) {
      assert.equal(body.distinct_id, hash16(COPILOT_SESSION_ID));
      assert.equal(body.properties.host, "copilot-cli");
      assert.equal(body.properties.turn, undefined);
      assertMatchesContract({ event: body.event, distinct_id: body.distinct_id, properties: body.properties });
    }
    const called = bodies.find((body) => body.event === "Plugin tool called");
    assert.equal(called.properties.server, "arcade");
    assert.equal(called.properties.tool, "Gmail_ListEmails");
    assert.equal(called.properties.arcade_used_before, false);
    const starts = bodies.filter((body) => body.event === "Plugin session started");
    assert.deepEqual(starts.map((body) => body.properties.arcade_used_before), [true, true, true]);
    for (const request of server.requests) {
      assert.doesNotMatch(request.body, new RegExp(`${COPILOT_SESSION_ID}|private|${dataDir}`));
    }
  } finally {
    await server.close();
  }
});

test("Copilot telemetry hook sends nothing when it must not", async () => {
  const server = await startServer();
  const arcadeCall = JSON.stringify(copilotInput({ hook_event_name: "PostToolUse", tool_name: "arcade-Gmail_ListEmails" }));
  // [label, env overrides]
  const cases = [
    ["COPILOT_OFFLINE=true", { COPILOT_OFFLINE: "true" }],
    ["COPILOT_OFFLINE=1", { COPILOT_OFFLINE: "1" }],
    ["ARCADE_PLUGIN_TELEMETRY=0", { ARCADE_PLUGIN_TELEMETRY: "0" }],
    ["DO_NOT_TRACK=1", { DO_NOT_TRACK: "1" }],
    ["no COPILOT_PLUGIN_DATA", { COPILOT_PLUGIN_DATA: "" }],
    ["relative COPILOT_PLUGIN_DATA", { COPILOT_PLUGIN_DATA: "relative/data" }],
  ];
  try {
    for (const [label, extra] of cases) {
      const dataDir = makeTempDir();
      const result = runHook("telemetry.mjs", arcadeCall, copilotEnv(dataDir, server.url, extra), "copilot");
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.equal(result.stdout, "", label);
      assert.deepEqual(readdirSync(dataDir), [], label);
    }
    const dataDir2 = makeTempDir();
    const result = runHook("telemetry.mjs", arcadeCall, hookEnv(dataDir2, server.url), "copilot");
    assert.equal(result.stdout, "");
    assert.deepEqual(readdirSync(dataDir2), [], "--host copilot with only CLAUDE_PLUGIN_DATA");
    // Opted out with install-id present: install-id deleted, nothing sent.
    const dataDir3 = makeTempDir();
    writeFileSync(path.join(dataDir3, "install-id"), "11111111-2222-3333-4444-555555555555");
    const result2 = runHook("telemetry.mjs", arcadeCall, copilotEnv(dataDir3, server.url, { ARCADE_PLUGIN_TELEMETRY: "0" }), "copilot");
    assert.equal(result2.status, 0, result2.stderr);
    assert.equal(result2.stdout, "", "opted out, with an old install-id to delete (copilot)");
    assert.deepEqual(readdirSync(dataDir3), [], "opted out, with an old install-id to delete (copilot)");
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

test("Copilot telemetry powershell command skips arcade-operator and sends exactly one event", { skip: !POWERSHELL && "pwsh not found" }, async () => {
  const manifest = JSON.parse(readRepoFile("com.github.copilot/hooks/hooks.json"));
  const psCwd = mkdtempSync(path.join(os.tmpdir(), "arcade-ps-"));
  const runPs = (script, inputStr, env) =>
    spawnSync(String(POWERSHELL), ["-NoProfile", "-NonInteractive", "-Command", script], {
      cwd: psCwd,
      input: inputStr,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });

  // SubagentStart powershell: arcade-operator should produce no output.
  const subagentStartPs = manifest.hooks.SubagentStart[0].powershell;
  const arcadeOperatorStart = JSON.stringify({
    sessionId: COPILOT_SESSION_ID,
    timestamp: 1790285282793,
    cwd: "/Users/someone/private-repo",
    agentName: OPERATOR,
    agentDisplayName: "arcade-operator",
  });
  const skipped = runPs(subagentStartPs, arcadeOperatorStart, { PLUGIN_ROOT: ROOT, COPILOT_PLUGIN_DATA: "" });
  assert.equal(skipped.status, 0, `SubagentStart skip: ${skipped.stderr}`);
  assert.equal(skipped.stdout, "", "arcade-operator SubagentStart: no output");

  // Telemetry powershell: SessionStart should send exactly one request.
  const telemetryPs = manifest.hooks.SessionStart.find((e) => e.powershell?.includes("telemetry.mjs"))?.powershell;
  assert.ok(telemetryPs, "SessionStart has a telemetry powershell command");
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    const sessionStart = JSON.stringify(copilotInput({ hook_event_name: "SessionStart", source: "new" }));
    const sent = runPs(telemetryPs, sessionStart, {
      PLUGIN_ROOT: ROOT,
      COPILOT_PLUGIN_DATA: dataDir,
      ARCADE_PLUGIN_TELEMETRY_HOST: server.url,
      ARCADE_PLUGIN_TELEMETRY: "",
      DO_NOT_TRACK: "",
      COPILOT_OFFLINE: "",
    });
    assert.equal(sent.status, 0, `telemetry powershell: ${sent.stderr}`);
    assert.equal(sent.stdout, "", "telemetry powershell: no stdout");
    await waitForRequests(server.requests, 1);
    await sleep(500);
    assert.equal(server.requests.length, 1, "exactly one request arrived");
    const body = JSON.parse(server.requests[0].body);
    assert.equal(body.event, "Plugin session started");
    assert.equal(body.properties.host, "copilot-cli");
  } finally {
    await server.close();
  }
});

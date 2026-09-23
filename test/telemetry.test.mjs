import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { runHook, ROOT } from "./helpers.mjs";
import {
  ALLOWED_PROPERTIES,
  buildEvent,
} from "../hooks/telemetry-events.mjs";
import {
  NOTICE,
  PLUGIN_VERSION,
  POSTHOG_KEY,
} from "../hooks/telemetry-config.mjs";

const INSTALL_ID = "11111111-2222-3333-4444-555555555555";
const OPTIONS = { installId: INSTALL_ID, os: "darwin" };
const SESSION_ID = "raw-session-id-123";
const PROMPT_ID = "raw-prompt-id-456";
const DEAD_HOST = "http://127.0.0.1:9";

const COMMON_KEYS = [
  "session",
  "turn",
  "host",
  "plugin_version",
  "os",
  "$process_person_profile",
  "$geoip_disable",
];

const hash16 = (id) =>
  createHash("sha256").update(`${INSTALL_ID}:${id}`).digest("hex").slice(0, 16);

const hookInput = (fields) => ({
  session_id: SESSION_ID,
  prompt_id: PROMPT_ID,
  transcript_path: "/Users/someone/.claude/projects/x/transcript.jsonl",
  cwd: "/Users/someone/private-repo",
  ...fields,
});

const extraProperties = (event) => {
  const extra = { ...event.properties };
  for (const key of COMMON_KEYS) delete extra[key];
  return extra;
};

const tempDirs = [];
const makeTempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "arcade-telemetry-"));
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

// The hook sends nothing until the first-run notice has been shown.
const markNoticeShown = (dataDir) => {
  writeFileSync(path.join(dataDir, "notice-shown"), "test");
};

const hookEnv = (dataDir, host, extra = {}) => ({
  CLAUDE_PLUGIN_DATA: dataDir,
  HOME: dataDir,
  ARCADE_PLUGIN_TELEMETRY_HOST: host,
  ARCADE_PLUGIN_TELEMETRY: "",
  DO_NOT_TRACK: "",
  ...extra,
});

const startServer = async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, body });
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

const waitForRequests = async (requests, count, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (requests.length < count && Date.now() < deadline) await sleep(50);
  return requests.length >= count;
};

// --- buildEvent ---

test("ALLOWED_PROPERTIES lists every event in the contract", () => {
  assert.deepEqual(Object.keys(ALLOWED_PROPERTIES).sort(), [
    "Plugin prompt submitted",
    "Plugin session ended",
    "Plugin session started",
    "Plugin skill invoked",
    "Plugin subagent started",
    "Plugin subagent stopped",
    "Plugin tool called",
    "Plugin tool failed",
    "Plugin turn ended",
  ]);
});

test("buildEvent: session started carries common properties and source", () => {
  const event = buildEvent(
    { session_id: SESSION_ID, hook_event_name: "SessionStart", source: "startup" },
    OPTIONS,
  );
  assert.deepEqual(event, {
    event: "Plugin session started",
    distinct_id: INSTALL_ID,
    properties: {
      source: "startup",
      host: "claude-code",
      plugin_version: PLUGIN_VERSION,
      os: "darwin",
      $process_person_profile: false,
      $geoip_disable: true,
      session: hash16(SESSION_ID),
    },
  });
  assert.match(event.properties.session, /^[0-9a-f]{16}$/);
});

test("buildEvent: session started never has turn and maps unknown source", () => {
  const event = buildEvent(
    hookInput({ hook_event_name: "SessionStart", source: "brand-new" }),
    OPTIONS,
  );
  assert.equal(event.properties.turn, undefined);
  assert.equal(event.properties.source, "other");
});

test("buildEvent: turn is hashed and omitted without prompt_id", () => {
  const withTurn = buildEvent(hookInput({ hook_event_name: "Stop" }), OPTIONS);
  assert.equal(withTurn.properties.turn, hash16(PROMPT_ID));

  const withoutTurn = buildEvent(
    { session_id: SESSION_ID, hook_event_name: "Stop" },
    OPTIONS,
  );
  assert.equal("turn" in withoutTurn.properties, false);
});

test("buildEvent: prompt submitted", () => {
  const external = buildEvent(
    hookInput({
      hook_event_name: "UserPromptSubmit",
      prompt: "What is on my calendar tomorrow?",
    }),
    OPTIONS,
  );
  assert.equal(external.event, "Plugin prompt submitted");
  assert.equal(external.properties.looks_external, true);
  assert.ok(external.properties.service_hints.includes("calendar"));
  assert.equal(external.properties.reminder_sent, true);

  const ack = buildEvent(
    hookInput({ hook_event_name: "UserPromptSubmit", prompt: "ok" }),
    OPTIONS,
  );
  assert.deepEqual(extraProperties(ack), {
    looks_external: false,
    service_hints: [],
    reminder_sent: false,
  });
});

test("buildEvent: Arcade tool calls send public tool names and the service", () => {
  const cases = [
    [
      "mcp__plugin_arcade_arcade__Gmail_ListEmails",
      undefined,
      { server: "arcade", tool: "Gmail_ListEmails", service: "email" },
    ],
    [
      "mcp__plugin_arcade_arcade__System_ManageAuthorization",
      undefined,
      { server: "arcade", tool: "System_ManageAuthorization" },
    ],
    [
      "mcp__plugin_arcade_arcade__Arcade_UseTool",
      { tool_name: "GoogleCalendar.ListEvents", inputs: { secret: "x" } },
      { server: "arcade", tool: "Arcade_UseTool", service: "calendar" },
    ],
    [
      "mcp__plugin_arcade_arcade__Arcade_UseTool",
      { tool_name: "AcmeHR.RunPayroll" },
      { server: "arcade", tool: "Arcade_UseTool" },
    ],
    [
      "mcp__plugin_arcade_arcade__AcmeHR_RunPayroll",
      undefined,
      { server: "arcade", tool: "other" },
    ],
    [
      "mcp__claude_ai_Arcade_Production__Arcade_UseTool",
      { tool_name: "Slack_SendMessage" },
      { server: "other_arcade", tool: "Arcade_UseTool", service: "chat" },
    ],
  ];
  for (const [toolName, toolInput, expected] of cases) {
    const event = buildEvent(
      hookInput({ hook_event_name: "PostToolUse", tool_name: toolName, tool_input: toolInput }),
      OPTIONS,
    );
    assert.equal(event.event, "Plugin tool called");
    assert.deepEqual(extraProperties(event), expected, toolName);
    assert.doesNotMatch(JSON.stringify(event), /AcmeHR|RunPayroll|claude_ai|secret/);
  }
});

test("buildEvent: unknown os is sent as other", () => {
  const event = buildEvent(hookInput({ hook_event_name: "Stop" }), {
    installId: INSTALL_ID,
    os: "freebsd",
  });
  assert.equal(event.properties.os, "other");
});

test("buildEvent: background task results are not user prompts", () => {
  const event = buildEvent(
    hookInput({
      hook_event_name: "UserPromptSubmit",
      prompt: "<task-notification>\n<status>completed</status> calendar meeting",
    }),
    OPTIONS,
  );
  assert.equal(event, null);
});

test("buildEvent: other servers send a service category, never a name", () => {
  const known = buildEvent(
    hookInput({
      hook_event_name: "PostToolUse",
      tool_name: "mcp__granola__Granola_ListMeetings",
    }),
    OPTIONS,
  );
  assert.deepEqual(extraProperties(known), {
    server: "other",
    service: "meetings",
  });

  const unknown = buildEvent(
    hookInput({
      hook_event_name: "PostToolUse",
      tool_name: "mcp__secret-server__DoThing",
    }),
    OPTIONS,
  );
  assert.deepEqual(extraProperties(unknown), { server: "other" });

  const namedInServer = buildEvent(
    hookInput({
      hook_event_name: "PostToolUse",
      tool_name: "mcp__claude_ai_Gmail__search_threads",
    }),
    OPTIONS,
  );
  assert.deepEqual(extraProperties(namedInServer), {
    server: "other",
    service: "email",
  });
  assert.doesNotMatch(JSON.stringify(namedInServer), /Gmail|search_threads/);
});

test("buildEvent: tool failure uses the same properties", () => {
  const event = buildEvent(
    hookInput({
      hook_event_name: "PostToolUseFailure",
      tool_name: "mcp__plugin_arcade_arcade__Slack_SendMessage",
      error: "boom",
    }),
    OPTIONS,
  );
  assert.equal(event.event, "Plugin tool failed");
  assert.deepEqual(extraProperties(event), {
    server: "arcade",
    tool: "Slack_SendMessage",
    service: "chat",
  });
});

test("buildEvent: skill invoked", () => {
  const cases = [
    ["arcade:try-arcade", "try-arcade"],
    ["arcade:scale-arcade", "scale-arcade"],
    ["try-arcade", "try-arcade"],
    ["other-plugin:try-arcade", "other"],
    ["my-private-skill", "other"],
    [undefined, "other"],
  ];
  for (const [skill, expected] of cases) {
    const event = buildEvent(
      hookInput({
        hook_event_name: "PreToolUse",
        tool_name: "Skill",
        tool_input: { skill },
      }),
      OPTIONS,
    );
    assert.equal(event.event, "Plugin skill invoked");
    assert.deepEqual(extraProperties(event), { skill: expected }, String(skill));
  }
});

test("buildEvent: subagent started", () => {
  const cases = [
    ["arcade:arcade-operator", "arcade-operator"],
    ["arcade-operator", "arcade-operator"],
    ["general-purpose", "other"],
  ];
  for (const [agentType, expected] of cases) {
    const event = buildEvent(
      hookInput({
        hook_event_name: "SubagentStart",
        agent_type: agentType,
        agent_id: "agent-1",
      }),
      OPTIONS,
    );
    assert.equal(event.event, "Plugin subagent started");
    assert.deepEqual(extraProperties(event), { agent: expected });
  }
});

test("buildEvent: subagent stopped parses the operator status", () => {
  const cases = [
    ["status: completed\nsummary: done", "completed"],
    ["Here you go.\n\nstatus: needs_auth\nsummary: sign in", "needs_auth"],
    ["**status:** needs_confirmation", "needs_confirmation"],
    ["- status: `needs_clarification`", "needs_clarification"],
    ["STATUS: FAILED", "failed"],
    ["status: exploded", "unknown"],
    ["no report at all", "unknown"],
    [undefined, "unknown"],
  ];
  for (const [message, expected] of cases) {
    const event = buildEvent(
      hookInput({
        hook_event_name: "SubagentStop",
        agent_type: "arcade:arcade-operator",
        last_assistant_message: message,
      }),
      OPTIONS,
    );
    assert.equal(event.event, "Plugin subagent stopped");
    assert.deepEqual(
      extraProperties(event),
      { agent: "arcade-operator", status: expected },
      String(message),
    );
  }

  const other = buildEvent(
    hookInput({
      hook_event_name: "SubagentStop",
      agent_type: "general-purpose",
      last_assistant_message: "status: completed",
    }),
    OPTIONS,
  );
  assert.deepEqual(extraProperties(other), { agent: "other" });
});

test("buildEvent: turn ended has no extra properties", () => {
  const event = buildEvent(hookInput({ hook_event_name: "Stop" }), OPTIONS);
  assert.equal(event.event, "Plugin turn ended");
  assert.deepEqual(extraProperties(event), {});
});

test("buildEvent: session ended keeps documented reasons only", () => {
  for (const reason of [
    "clear",
    "resume",
    "logout",
    "prompt_input_exit",
    "bypass_permissions_disabled",
    "other",
  ]) {
    const event = buildEvent(
      hookInput({ hook_event_name: "SessionEnd", reason }),
      OPTIONS,
    );
    assert.equal(event.event, "Plugin session ended");
    assert.deepEqual(extraProperties(event), { reason });
  }
  const odd = buildEvent(
    hookInput({ hook_event_name: "SessionEnd", reason: "/secret/path" }),
    OPTIONS,
  );
  assert.deepEqual(extraProperties(odd), { reason: "other" });
});

test("buildEvent: untracked input returns null", () => {
  const cases = [
    { hook_event_name: "PostToolUse", tool_name: "Read" },
    { hook_event_name: "PostToolUseFailure", tool_name: "Bash" },
    { hook_event_name: "PreToolUse", tool_name: "Bash" },
    { hook_event_name: "PreToolUse", tool_name: "mcp__plugin_arcade_arcade__X" },
    { hook_event_name: "Notification" },
    {},
  ];
  for (const input of cases) {
    assert.equal(buildEvent(hookInput(input), OPTIONS), null, JSON.stringify(input));
  }
  assert.equal(buildEvent(null, OPTIONS), null);
  assert.equal(buildEvent("SessionStart", OPTIONS), null);
});

test("buildEvent never leaks prompt text, paths, tool data, or raw ids", () => {
  const secrets = {
    session_id: "SECRET-session-id",
    prompt_id: "SECRET-prompt-id",
    transcript_path: "/SECRET/transcript.jsonl",
    cwd: "/SECRET/cwd",
    prompt: "SECRET prompt text about my calendar",
    tool_input: { query: "SECRET tool input", skill: "SECRET-plugin:SECRET-skill" },
    tool_response: { content: "SECRET tool output" },
    error: "SECRET error text",
    last_assistant_message: "SECRET final report\nstatus: completed",
    agent_id: "SECRET-agent-id",
    permission_mode: "SECRET-mode",
    extra_field: "SECRET extra",
  };
  const inputs = [
    { hook_event_name: "SessionStart", source: "SECRET-source" },
    { hook_event_name: "UserPromptSubmit" },
    { hook_event_name: "PostToolUse", tool_name: "mcp__secret-server__DoThing" },
    { hook_event_name: "PostToolUseFailure", tool_name: "mcp__secret-server__DoThing" },
    { hook_event_name: "PostToolUse", tool_name: "mcp__SECRET__Granola_ListMeetings" },
    { hook_event_name: "PreToolUse", tool_name: "Skill" },
    { hook_event_name: "SubagentStart", agent_type: "SECRET-agent" },
    { hook_event_name: "SubagentStop", agent_type: "SECRET-agent" },
    { hook_event_name: "SubagentStop", agent_type: "arcade:arcade-operator" },
    { hook_event_name: "Stop" },
    { hook_event_name: "SessionEnd", reason: "SECRET-reason" },
  ];

  for (const fields of inputs) {
    const event = buildEvent({ ...secrets, ...fields }, OPTIONS);
    assert.ok(event, fields.hook_event_name);
    const serialized = JSON.stringify(event);
    assert.doesNotMatch(serialized, /secret/i, serialized);
    assert.doesNotMatch(serialized, /DoThing/, serialized);

    const allowed = [...COMMON_KEYS, ...ALLOWED_PROPERTIES[event.event]];
    for (const key of Object.keys(event.properties)) {
      assert.ok(allowed.includes(key), `${event.event}: ${key}`);
    }
  }
});

// --- hook script ---

test("telemetry hook posts the event to PostHog from a detached sender", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    markNoticeShown(dataDir);
    const result = runHook(
      "telemetry.mjs",
      JSON.stringify(
        hookInput({
          hook_event_name: "PostToolUse",
          tool_name: "mcp__plugin_arcade_arcade__Gmail_ListEmails",
          tool_input: { query: "private words" },
          tool_response: { content: "private output" },
        }),
      ),
      hookEnv(dataDir, server.url),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");

    assert.ok(await waitForRequests(server.requests, 1), "no request received");
    const [request] = server.requests;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/i/v0/e/");

    const installId = readFileSync(path.join(dataDir, "install-id"), "utf8").trim();
    assert.match(installId, /^[0-9a-f-]{36}$/);

    const body = JSON.parse(request.body);
    assert.equal(body.api_key, POSTHOG_KEY);
    assert.equal(body.event, "Plugin tool called");
    assert.equal(body.distinct_id, installId);
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
    assert.equal(body.properties.server, "arcade");
    assert.equal(body.properties.tool, "Gmail_ListEmails");
    assert.equal(body.properties.host, "claude-code");
    assert.equal(body.properties.os, process.platform);

    assert.doesNotMatch(request.body, new RegExp(SESSION_ID));
    assert.doesNotMatch(request.body, new RegExp(PROMPT_ID));
    assert.doesNotMatch(request.body, /private/);
  } finally {
    await server.close();
  }
});

test("telemetry hook shows the notice exactly once", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    const input = JSON.stringify({
      session_id: SESSION_ID,
      hook_event_name: "SessionStart",
      source: "startup",
    });
    const env = hookEnv(dataDir, server.url);

    const first = runHook("telemetry.mjs", input, env);
    assert.equal(first.status, 0, first.stderr);
    const out = JSON.parse(first.stdout);
    assert.deepEqual(out, { systemMessage: NOTICE });
    assert.match(NOTICE, /ARCADE_PLUGIN_TELEMETRY=0/);
    assert.match(NOTICE, /docs\/telemetry\.md/);
    assert.ok(existsSync(path.join(dataDir, "notice-shown")));

    const second = runHook("telemetry.mjs", input, env);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, "");

    assert.ok(await waitForRequests(server.requests, 2), "expected two events");
    for (const request of server.requests) {
      assert.equal(JSON.parse(request.body).event, "Plugin session started");
    }
  } finally {
    await server.close();
  }
});

test("telemetry hook sends nothing when opted out", async () => {
  const server = await startServer();
  try {
    const optOuts = [
      { ARCADE_PLUGIN_TELEMETRY: "0" },
      { ARCADE_PLUGIN_TELEMETRY: "false" },
      { ARCADE_PLUGIN_TELEMETRY: "OFF" },
      { ARCADE_PLUGIN_TELEMETRY: "no" },
      { DO_NOT_TRACK: "1" },
      { DO_NOT_TRACK: "true" },
    ];
    for (const optOut of optOuts) {
      const dataDir = makeTempDir();
      const result = runHook(
        "telemetry.mjs",
        JSON.stringify(hookInput({ hook_event_name: "SessionStart", source: "startup" })),
        hookEnv(dataDir, server.url, optOut),
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", JSON.stringify(optOut));
      assert.deepEqual(readdirSync(dataDir), [], JSON.stringify(optOut));
    }
    await sleep(1000);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test(
  "telemetry hook sends nothing when the data dir is read-only",
  {
    skip:
      process.platform === "win32" || process.getuid?.() === 0
        ? "chmod does not block writes here"
        : false,
  },
  async () => {
    const server = await startServer();
    try {
      const dataDir = makeTempDir();
      chmodSync(dataDir, 0o500);
      for (const hookEvent of ["SessionStart", "Stop"]) {
        const result = runHook(
          "telemetry.mjs",
          JSON.stringify(hookInput({ hook_event_name: hookEvent, source: "startup" })),
          hookEnv(dataDir, server.url),
        );
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "", hookEvent);
      }
      await sleep(1000);
      assert.equal(server.requests.length, 0);
    } finally {
      await server.close();
    }
  },
);

test("telemetry hook sends nothing before the notice has been shown", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    const result = runHook(
      "telemetry.mjs",
      JSON.stringify(hookInput({ hook_event_name: "Stop" })),
      hookEnv(dataDir, server.url),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    await sleep(1000);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("telemetry hook sends nothing without CLAUDE_PLUGIN_DATA", async () => {
  const server = await startServer();
  try {
    const home = makeTempDir();
    const result = runHook(
      "telemetry.mjs",
      JSON.stringify(hookInput({ hook_event_name: "SessionStart", source: "startup" })),
      { ...hookEnv(home, server.url), CLAUDE_PLUGIN_DATA: "" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.deepEqual(readdirSync(home), []);
    await sleep(1000);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("telemetry hook sends nothing for untracked or invalid input", async () => {
  const server = await startServer();
  try {
    const dataDir = makeTempDir();
    markNoticeShown(dataDir);
    const inputs = [
      JSON.stringify(hookInput({ hook_event_name: "PostToolUse", tool_name: "Read" })),
      JSON.stringify(hookInput({ hook_event_name: "PreToolUse", tool_name: "Bash" })),
      JSON.stringify(hookInput({ hook_event_name: "Notification" })),
      "not-json",
      "",
      "null",
    ];
    for (const input of inputs) {
      const result = runHook("telemetry.mjs", input, hookEnv(dataDir, server.url));
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", input);
    }
    await sleep(1000);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("telemetry hook exits quickly when the host is unreachable", () => {
  const dataDir = makeTempDir();
  const started = Date.now();
  const result = runHook(
    "telemetry.mjs",
    JSON.stringify(hookInput({ hook_event_name: "Stop" })),
    hookEnv(dataDir, DEAD_HOST),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(Date.now() - started < 2000, "hook waited on the network");
});

test("telemetry sender gives up on a host that never answers", async () => {
  const silent = net.createServer(() => {});
  await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve));
  try {
    const event = { event: "Plugin turn ended", distinct_id: "x", properties: {} };
    const started = Date.now();
    const child = spawn(
      process.execPath,
      [path.join(ROOT, "hooks", "telemetry-send.mjs"), JSON.stringify(event)],
      {
        env: {
          ...process.env,
          ARCADE_PLUGIN_TELEMETRY_HOST: `http://127.0.0.1:${silent.address().port}`,
        },
      },
    );
    const status = await new Promise((resolve) => child.on("exit", resolve));
    const elapsed = Date.now() - started;
    assert.equal(status, 0);
    assert.ok(elapsed >= 2500, `sender returned before its timeout (${elapsed} ms)`);
    assert.ok(elapsed < 5000, `sender ignored its timeout (${elapsed} ms)`);
  } finally {
    silent.close();
  }
});

test("telemetry sender exits 0 on bad input", () => {
  const garbage = spawnSync(
    process.execPath,
    [path.join(ROOT, "hooks", "telemetry-send.mjs"), "not-json"],
    { encoding: "utf8" },
  );
  assert.equal(garbage.status, 0, garbage.stderr);
});

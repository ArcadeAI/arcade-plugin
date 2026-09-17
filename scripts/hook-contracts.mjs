import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const CODEX_SCHEMA_DIR = "schemas/vendor/openai/codex-hooks";
const ajvDraft7 = new Ajv({ allErrors: true, strict: false });
const ajv2020 = new Ajv2020({ allErrors: true, strict: false });

const loadJson = (root, relativePath) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const compileSchema = (root, relativePath) => {
  const schema = loadJson(root, relativePath);
  const ajv = schema.$schema?.includes("2020-12") ? ajv2020 : ajvDraft7;
  const validate = ajv.compile(schema);
  if (!validate) {
    throw new Error(`failed to compile ${relativePath}`);
  }
  return validate;
};

const runHook = (root, script, stdin) =>
  spawnSync("node", [path.join(root, "hooks", script)], {
    input: stdin,
    encoding: "utf8",
    cwd: root,
  });

export const HOOK_CONTRACTS = [
  {
    name: "session-start codex fork",
    script: "session-start.mjs",
    input: {
      cwd: "/repo",
      hook_event_name: "SessionStart",
      model: "gpt-5",
      permission_mode: "default",
      session_id: "codex-fork-1",
      source: "fork",
      transcript_path: null,
    },
    inputSchema: `${CODEX_SCHEMA_DIR}/session-start.command.input.schema.json`,
    outputSchema: `${CODEX_SCHEMA_DIR}/session-start.command.output.schema.json`,
  },
  {
    name: "session-start cursor full fixture",
    script: "session-start.mjs",
    input: {
      hook_event_name: "sessionStart",
      conversation_id: "conv-1",
      cursor_version: "1.0.0",
      workspace_roots: ["/repo"],
      session_id: "s1",
      is_background_agent: false,
      composer_mode: "agent",
    },
    outputSchema: "schemas/host-adapters/cursor-hook-output.schema.json",
  },
  {
    name: "user-prompt-submit codex",
    script: "user-prompt-submit.mjs",
    input: {
      cwd: "/repo",
      hook_event_name: "UserPromptSubmit",
      model: "gpt-5",
      permission_mode: "default",
      prompt: "What is on my calendar tomorrow?",
      session_id: "codex-1",
      transcript_path: null,
      turn_id: "turn-1",
    },
    inputSchema: `${CODEX_SCHEMA_DIR}/user-prompt-submit.command.input.schema.json`,
    outputSchema: `${CODEX_SCHEMA_DIR}/user-prompt-submit.command.output.schema.json`,
  },
  {
    name: "user-prompt-submit suppressed",
    script: "user-prompt-submit.mjs",
    input: { prompt: "ok" },
    expectEmptyStdout: true,
  },
  {
    name: "subagent-start codex",
    script: "subagent-start.mjs",
    input: {
      agent_id: "agent-1",
      agent_type: "review",
      cwd: "/repo",
      hook_event_name: "SubagentStart",
      model: "gpt-5",
      permission_mode: "default",
      session_id: "codex-1",
      transcript_path: null,
      turn_id: "turn-1",
    },
    inputSchema: `${CODEX_SCHEMA_DIR}/subagent-start.command.input.schema.json`,
    outputSchema: `${CODEX_SCHEMA_DIR}/subagent-start.command.output.schema.json`,
  },
  {
    name: "subagent-start skips arcade-operator",
    script: "subagent-start.mjs",
    input: {
      hook_event_name: "SubagentStart",
      agent_id: "agent-op",
      agent_type: "arcade:arcade-operator",
    },
    expectEmptyStdout: true,
  },
];

export const validateHookContracts = (root) => {
  const errors = [];

  for (const contract of HOOK_CONTRACTS) {
    const stdin = JSON.stringify(contract.input ?? {});

    if (contract.inputSchema) {
      const validateInput = compileSchema(root, contract.inputSchema);
      if (!validateInput(contract.input)) {
        errors.push(
          `${contract.name}: input fixture invalid — ${JSON.stringify(validateInput.errors)}`,
        );
        continue;
      }
    }

    const result = runHook(root, contract.script, stdin);
    if (result.status !== 0) {
      errors.push(
        `${contract.name}: hook exited ${result.status} — ${result.stderr}`,
      );
      continue;
    }

    const stdout = result.stdout.trim();
    if (contract.expectEmptyStdout) {
      if (stdout !== "") {
        errors.push(`${contract.name}: expected empty stdout, got ${stdout}`);
      }
      continue;
    }

    if (!contract.outputSchema) {
      errors.push(`${contract.name}: missing outputSchema`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (parseError) {
      errors.push(`${contract.name}: stdout is not JSON — ${parseError.message}`);
      continue;
    }

    const validateOutput = compileSchema(root, contract.outputSchema);
    if (!validateOutput(parsed)) {
      errors.push(
        `${contract.name}: stdout invalid — ${JSON.stringify(validateOutput.errors)}`,
      );
    }
  }

  return errors;
};

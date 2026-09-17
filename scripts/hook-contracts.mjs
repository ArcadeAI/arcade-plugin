import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ajvDraft7 = new Ajv({ allErrors: true, strict: false });
const ajv2020 = new Ajv2020({ allErrors: true, strict: false });
const compiledSchemas = new Map();

const loadJson = (root, relativePath) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const compileSchema = (root, relativePath) => {
  if (compiledSchemas.has(relativePath)) {
    return compiledSchemas.get(relativePath);
  }
  const schema = loadJson(root, relativePath);
  const ajv = schema.$schema?.includes("2020-12") ? ajv2020 : ajvDraft7;
  const validate = ajv.compile(schema);
  if (!validate) {
    throw new Error(`failed to compile ${relativePath}`);
  }
  compiledSchemas.set(relativePath, validate);
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
    name: "session-start claude empty stdin",
    script: "session-start.mjs",
    input: {},
    outputSchema: "schemas/host-adapters/claude-hook-output.schema.json",
  },
  {
    name: "user-prompt-submit substantive",
    script: "user-prompt-submit.mjs",
    input: { prompt: "What is on my calendar tomorrow?" },
    outputSchema: "schemas/host-adapters/claude-hook-output.schema.json",
  },
  {
    name: "user-prompt-submit suppressed",
    script: "user-prompt-submit.mjs",
    input: { prompt: "ok" },
    expectEmptyStdout: true,
  },
  {
    name: "subagent-start claude shape",
    script: "subagent-start.mjs",
    input: {
      hook_event_name: "SubagentStart",
      agent_type: "review",
    },
    outputSchema: "schemas/host-adapters/claude-hook-output.schema.json",
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

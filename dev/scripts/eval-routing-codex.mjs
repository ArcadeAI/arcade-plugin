import { execFile, execFileSync } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { prepareRoutingEval } from "./eval-routing.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CODEX = join(ROOT, "dev/node_modules/.bin/codex");
const exec = promisify(execFile);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
const directToolNames = {
  "Calendar.ListEvents": "list_calendar_events",
  "Gmail.SearchEmails": "search_gmail",
  "Slack.SearchMessages": "search_slack",
  "Github.ListIssues": "list_github_issues",
};

async function startMocks(toolLists, trial) {
  const server = createServer(async (request, response) => {
    const endpoint = request.url.slice(1);
    const tools = toolLists[endpoint];
    if (request.method !== "POST" || !Array.isArray(tools)) {
      response.writeHead(405).end();
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const { id, method, params } = JSON.parse(Buffer.concat(chunks));
      if (id === undefined) {
        response.writeHead(202).end();
        return;
      }
      let result;
      if (method === "initialize") {
        result = { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: endpoint, version: "1" } };
      } else if (method === "tools/list") {
        trial.listed.add(endpoint);
        result = { tools: tools.map((tool) => ({ ...tool, annotations: { ...tool.annotations, readOnlyHint: true } })) };
      } else if (method === "tools/call") {
        result = callFixture(endpoint, params, trial);
      } else if (method === "ping") {
        result = {};
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        jsonrpc: "2.0", id, ...(result ? { result } : { error: { code: -32601, message: "Method not found" } }),
      }));
    } catch {
      response.writeHead(400).end();
    }
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  return server;
}

function callFixture(endpoint, params, trial) {
  const { name, arguments: inputs } = params;
  const { entry, calls } = trial;
  let body = { error: "This tool call does not match the fixture" };
  if (endpoint === "direct") {
    calls.direct++;
    if (entry.route !== "none" && name === directToolNames[entry.app]) body = entry.answer;
  } else if (name === "Arcade_SelectTools") {
    calls.selected++;
    if (entry.route !== "none" && Array.isArray(inputs?.tasks)) {
      body = {
        query_id: "fixture-query",
        results: [{ task: entry.prompt, suggestions: [{ name: entry.app, description: "Read the requested app data.", input_schema: { type: "object", additionalProperties: true } }] }],
      };
    }
  } else if (name === "Arcade_UseTool") {
    calls.executed++;
    if (entry.route !== "none" && inputs?.tool_name === entry.app &&
        inputs.query_id === "fixture-query" && inputs.inputs && typeof inputs.inputs === "object" && !Array.isArray(inputs.inputs)) body = entry.answer;
  }
  const isError = Boolean(body.error);
  if (isError) calls.fixtureErrors++;
  return { content: [{ type: "text", text: JSON.stringify(body) }], ...(isError ? { isError } : {}) };
}

async function prepareCodex(root, urls, model, apiKey) {
  const homeDir = join(root, "home");
  const codexHome = join(root, "codex");
  const marketplaceDir = join(root, "marketplace");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(codexHome);
  const marketplacePath = join(marketplaceDir, ".agents/plugins/marketplace.json");
  mkdirSync(dirname(marketplacePath), { recursive: true });
  writeJson(marketplacePath, {
    name: "arcade",
    plugins: [{
      name: "arcade",
      source: { source: "local", path: "./plugin" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    }],
  });
  cpSync(join(ROOT, "plugin"), join(marketplaceDir, "plugin"), { recursive: true });
  const mcpPath = join(marketplaceDir, "plugin/mcp.json");
  const mcp = readJson(mcpPath);
  mcp.mcpServers = { arcade: { type: "streamable-http", url: urls.arcade } };
  writeJson(mcpPath, mcp);

  const env = { PATH: process.env.PATH ?? "", HOME: homeDir, CODEX_HOME: codexHome };
  const run = async (args, { useModel = false } = {}) => {
    const result = exec(CODEX, args, {
      cwd: homeDir,
      env: useModel ? { ...env, CODEX_API_KEY: apiKey } : env,
      timeout: 90000,
      maxBuffer: 4 * 1024 * 1024,
    });
    result.child.stdin.end();
    return (await result).stdout;
  };
  await run(["plugin", "marketplace", "add", marketplaceDir]);
  await run(["plugin", "add", "arcade@arcade", "--json"]);
  if (urls.direct) await run(["mcp", "add", "direct", "--url", urls.direct]);
  const servers = JSON.parse(await run(["mcp", "list", "--json"]));
  const loaded = Object.fromEntries(servers.map((server) => [server.name, server.transport?.url]));
  if (servers.length !== Object.keys(urls).length || Object.entries(urls).some(([name, url]) => loaded[name] !== url)) {
    throw new Error("Codex did not load exactly the expected mock MCP servers");
  }
  if (!(await run(["debug", "prompt-input"])).includes("arcade:try-arcade")) {
    throw new Error("Codex did not load the Arcade skill");
  }
  return (prompt) => run([
    "-c", "web_search=\"disabled\"", "-c", "approval_policy=\"never\"",
    "--disable", "hooks", "--disable", "remote_plugin", "--disable", "skill_mcp_dependency_install",
    "--disable", "shell_tool", "exec", "--json", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "--model", model, prompt,
  ], { useModel: true });
}

const { values } = parseArgs({ options: {
  model: { type: "string", default: "gpt-6-sol" },
  runs: { type: "string", default: "1" },
  out: { type: "string", default: "dev/.cache/codex-routing-eval.json" },
  "prepare-only": { type: "boolean" },
} });
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error("--runs must be an integer from 1 to 5");
const apiKey = process.env.CODEX_API_KEY;
if (!values["prepare-only"] && !apiKey) throw new Error("Set CODEX_API_KEY for paid Codex eval runs");

const workDir = mkdtempSync(join(tmpdir(), "arcade-codex-routing-"));
const trial = { listed: new Set() };
let server;
try {
  const fixtures = join(workDir, "fixtures");
  const cases = prepareRoutingEval(fixtures).filter((entry) => ["arcade", "none"].includes(entry.route));
  const tools = Object.fromEntries(["arcade", "direct"].map((name) => [
    name, readJson(join(fixtures, "no-hooks/evals/mocks", name, "_tools.json")).tools,
  ]));
  server = await startMocks(tools, trial);
  const address = "http://127.0.0.1:" + server.address().port;
  const rows = [];
  for (const condition of ["arcade-only", "competing-mcp"]) {
    const urls = { arcade: address + "/arcade" };
    if (condition === "competing-mcp") urls.direct = address + "/direct";
    const run = await prepareCodex(join(workDir, condition), urls, values.model, apiKey);
    console.log("Verified Codex plugin and mock MCP configuration for " + condition);
    if (values["prepare-only"]) continue;
    for (const entry of cases) {
      for (let repetition = 1; repetition <= runs; repetition++) {
        Object.assign(trial, { entry, calls: { selected: 0, executed: 0, direct: 0, fixtureErrors: 0 } });
        trial.listed.clear();
        const row = { condition, name: entry.name, repetition, ...trial.calls };
        try {
          const events = (await run(entry.prompt)).trim().split("\n").map(JSON.parse);
          if (!events.some((event) => event.type === "turn.completed")) {
            row.error = "Codex did not complete the turn";
          } else if (Object.keys(urls).some((name) => !trial.listed.has(name))) {
            row.error = "Codex did not discover every configured mock tool list";
          } else {
            const messages = events.filter((event) => event.type === "item.completed" && event.item.type === "agent_message");
            row.answer = new RegExp(entry.pattern, "i").test(messages.at(-1)?.item.text ?? "");
            row.route = entry.route === "none"
              ? trial.calls.selected + trial.calls.executed + trial.calls.direct === 0
              : trial.calls.selected > 0 && trial.calls.executed > 0 && trial.calls.direct === 0;
          }
        } catch {
          // The raw CLI transcript and provider errors may contain private data.
          row.error = "Codex execution failed or returned invalid JSON";
        }
        Object.assign(row, trial.calls);
        rows.push(row);
      }
    }
  }
  if (!values["prepare-only"]) {
    const errors = rows.filter((row) => row.error).length;
    const misses = rows.filter((row) => !row.error && (!row.route || !row.answer || row.fixtureErrors)).length;
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const version = execFileSync(CODEX, ["--version"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: join(workDir, "arcade-only/home"), CODEX_HOME: join(workDir, "arcade-only/codex") },
    }).trim();
    const scope = "Codex routing with installed skill metadata and synthetic MCP tools. Shell access, skill file reads, and live app actions are outside this eval.";
    const summary = { sourceCommit, version, model: values.model, scope, runs, errors, misses, rows };
    mkdirSync(dirname(values.out), { recursive: true });
    writeJson(values.out, summary);
    console.log("Codex routing eval completed: " + rows.length + " runs, " + misses + " misses, " + errors + " errors");
    if (errors) process.exitCode = 1;
  }
} catch {
  console.error("Codex routing eval setup failed. Check the pinned CLI installation and loopback MCP access.");
  process.exitCode = 1;
} finally {
  server?.closeAllConnections();
  server?.close();
  rmSync(workDir, { recursive: true, force: true });
}

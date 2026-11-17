import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHookManifest } from "./generate-manifests.mjs";
import { SESSION_CONTEXT } from "../../plugin/hooks/routing-guidance.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CASES = JSON.parse(readFileSync(join(ROOT, "dev/evals/routing/cases.json"), "utf8"));
const string = { type: "string" };
const object = { type: "object", additionalProperties: true };
const tool = (name, description, properties, required = []) => ({ name, description, inputSchema: { type: "object", properties, required } });
const ARCADE_TOOLS = [
  tool("Arcade_SelectTools", "Discover tools by describing tasks. Returns matching tools with full input schemas. Execute discovered tools using Arcade_UseTool with the tool name and inputs matching the schema.", { tasks: { type: "array", items: string }, context: string }, ["tasks"]),
  tool("Arcade_UseTool", "Execute a tool discovered through Arcade_SelectTools. Pass the tool_name and its arguments in inputs, with the query_id returned by discovery.", { tool_name: string, inputs: object, query_id: string }, ["tool_name", "inputs"]),
];
const DIRECT_TOOLS = [
  tool("list_calendar_events", "Read events from the user's calendar in a specified date range.", { date_from: string, date_to: string }),
  tool("search_gmail", "Search the user's Gmail inbox and read matching messages.", { query: string }, ["query"]),
  tool("search_slack", "Search Slack messages by channel, date, and query.", { query: string }, ["query"]),
  tool("list_github_issues", "List GitHub issues in a repository, filtered by assignee and state.", { repository: string, assignee: string, state: string }, ["repository"]),
];

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function grader(dir, name, fields) {
  write(join(dir, "graders", `${name}.md`), `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n`);
}

export function prepareRoutingEval(outDir, { caseName, competition = "both" } = {}) {
  if (existsSync(outDir) && readdirSync(outDir).length) throw new Error(`Use a fresh output directory: ${outDir}`);
  if (!["both", "cli"].includes(competition)) throw new Error("--competition must be both or cli");
  const cases = CASES.filter((entry) => !caseName || entry.name === caseName);
  if (!cases.length) throw new Error(`Unknown case: ${caseName}`);
  for (const arm of ["hooks", "no-hooks"]) {
    const plugin = join(outDir, arm);
    cpSync(join(ROOT, "clients/claude"), plugin, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
    if (competition === "both") manifest.mcpServers.direct = { type: "http", url: "https://example.invalid/direct" };
    if (arm === "hooks") {
      cpSync(join(ROOT, "plugin/hooks"), join(plugin, "hooks"), { recursive: true });
      manifest.hooks = "./hooks/eval-hooks.json";
      write(join(plugin, "hooks/eval-hooks.json"), buildHookManifest("claude-code"));
    }
    write(join(plugin, ".claude-plugin/plugin.json"), manifest);
    const suite = join(plugin, "evals");
    write(join(suite, "mocks/arcade/_tools.json"), { tools: ARCADE_TOOLS });
    if (competition === "both") write(join(suite, "mocks/direct/_tools.json"), { tools: DIRECT_TOOLS });
    for (const entry of cases) {
      const dir = join(suite, entry.name);
      write(join(dir, "prompt.md"), `---\nmax_turns: 16\ntimeout_seconds: 150\nallowed_tools: [Read, Glob, Grep, Skill, Agent, Bash]\n---\n\n${entry.prompt}\n`);
      write(join(dir, "case.yaml"), `schema_version: "1.1"\nname: ${entry.name}\ncontext:\n  scaffold_script: setup.sh\n`);
      write(join(dir, "setup.sh"), `#!/bin/sh\nset -eu\nmkdir -p .eval-bin\ncat > .eval-bin/gh <<'GH'\n#!/bin/sh\nprintf '%s\\n' '[{"number":17,"title":"Fix login timeout","state":"OPEN","assignees":[{"login":"me"}]}]'\nGH\nchmod +x .eval-bin/gh\n`);
      const selected = {
        query_id: "fixture-query",
        results: [{ task: entry.prompt, suggestions: [{ name: entry.app, description: "Read the requested app data.", input_schema: object }] }],
      };
      write(join(dir, "mocks/arcade/Arcade_SelectTools.md"), `---\nexpect:\n  tasks: array\n---\n${JSON.stringify(selected)}\n`);
      write(join(dir, "mocks/arcade/Arcade_UseTool.md"), `${JSON.stringify(entry.answer)}\n`);
      if (competition === "both") for (const item of DIRECT_TOOLS) write(join(dir, `mocks/direct/${item.name}.md`), `${JSON.stringify(entry.answer)}\n`);
      grader(dir, "answer", { type: "regex", pattern: entry.pattern, flags: "i" });
      grader(dir, "arcade-selected", { type: "tool_used", tool: "mcp__plugin_arcade_arcade__Arcade_SelectTools", min: ["arcade", "auth"].includes(entry.route) ? 1 : 0, ...(["cli", "none"].includes(entry.route) ? { max: 0 } : {}) });
      grader(dir, "arcade-executed", { type: "tool_used", tool: "mcp__plugin_arcade_arcade__Arcade_UseTool", min: ["arcade", "auth"].includes(entry.route) ? 1 : 0, ...(["cli", "none"].includes(entry.route) ? { max: 0 } : {}) });
      grader(dir, "skill-used", { type: "tool_used", tool: "Skill", min: 0 });
      grader(dir, "cli-used", { type: "tool_used", tool: "Bash", input_match: "gh\\s+(issue|api)", min: entry.route === "cli" ? 1 : 0, ...(entry.route !== "cli" ? { max: 0 } : {}) });
      for (const item of DIRECT_TOOLS) grader(dir, `no-${item.name}`, { type: "tool_used", tool: `mcp__plugin_arcade_direct__${item.name}`, min: 0, max: 0 });
    }
  }
  write(join(outDir, "setup.json"), { sourceCommit: readCommit(), competition, sessionContext: SESSION_CONTEXT, cases: cases.map((entry) => ({ name: entry.name, route: entry.route, prompt: entry.prompt })), arms: ["hooks", "no-hooks"], scope: "Synthetic MCP and gh responses; real model routing. No live app accounts or app-task success is evaluated." });
  return cases;
}

function readCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

export function callCount(run, name) {
  const grade = run.graders.find((entry) => entry.name === name);
  const match = grade?.explanation.match(/called (\d+)x/);
  if (!match) throw new Error(`Missing tool-call count for ${name}`);
  return Number(match[1]);
}

export function summarizeRun(run, entry) {
  if (run.error || run.aborted || run.skippedPaidGraders) return { name: entry.name, valid: false, error: run.error ?? run.aborted ?? "incomplete grading" };
  const selected = callCount(run, "arcade-selected");
  const executed = callCount(run, "arcade-executed");
  const direct = DIRECT_TOOLS.reduce((total, item) => total + callCount(run, `no-${item.name}`), 0);
  const mockCalls = selected + executed + direct;
  if (run.mocks?.calls?.total !== mockCalls) return { name: entry.name, valid: false, error: "MCP transcript and mock-call counts disagree" };
  return {
    name: entry.name, route: entry.route, valid: true,
    selected, executed, direct, cli: callCount(run, "cli-used"), skill: callCount(run, "skill-used"),
    answer: run.graders.find((grade) => grade.name === "answer")?.passed === true,
    seconds: run.durationSeconds, estimatedUsd: run.costUsd,
  };
}

export function summarizeRoutingEval(outDir) {
  const setup = JSON.parse(readFileSync(join(outDir, "setup.json"), "utf8"));
  const summary = { sourceCommit: setup.sourceCommit, competition: setup.competition ?? "both", scope: setup.scope, arms: {} };
  for (const arm of setup.arms) {
    const result = JSON.parse(readFileSync(join(outDir, "results", arm, "aggregate-result.json"), "utf8"));
    const rows = [];
    for (const entry of result.cases) {
      const definition = setup.cases.find((item) => item.name === entry.name);
      for (const [index, run] of entry.arms.with.entries()) {
        const row = { ...summarizeRun(run, definition), repetition: index + 1 };
        row.trace = join("traces", arm, `${entry.name}-${index + 1}.jsonl`);
        const retained = join(outDir, row.trace);
        const tracePath = existsSync(retained) ? retained : run.tracePath;
        if (!tracePath || !existsSync(tracePath)) {
          row.valid = false;
          row.error ??= "Trace is missing; run with --keep-temp";
          rows.push(row);
          continue;
        }
        const traceText = readFileSync(tracePath, "utf8");
        const trace = traceText.trim().split("\n").map((line) => JSON.parse(line));
        const init = trace.find((event) => event.type === "system" && event.subtype === "init");
        const hook = trace.find((event) => {
          if (event.type !== "system" || event.subtype !== "hook_response" || event.hook_event !== "SessionStart" || event.exit_code !== 0) return false;
          try {
            return JSON.parse(event.stdout ?? event.output ?? "{}").hookSpecificOutput?.additionalContext === (setup.sessionContext ?? SESSION_CONTEXT);
          } catch { return false; }
        });
        row.model = init?.model;
        row.sessionHookObserved = Boolean(hook);
        if ((arm === "hooks") !== row.sessionHookObserved) { row.valid = false; row.error = "Session hook state does not match the arm"; }
        write(retained, traceText);
        rows.push(row);
      }
    }
    const natural = rows.filter((row) => row.valid && ["calendar", "email", "slack", "github"].includes(row.name));
    summary.arms[arm] = {
      partial: result.partial, claudeVersion: result.claudeVersion,
      total: rows.length, errors: rows.filter((row) => !row.valid).length,
      natural: { total: natural.length, arcade: natural.filter((row) => row.executed > 0).length, direct: natural.filter((row) => row.direct > 0).length, cli: natural.filter((row) => row.cli > 0).length, answers: natural.filter((row) => row.answer).length },
      rows,
    };
  }
  write(join(outDir, "summary.json"), summary);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(summary.arms).map(([arm, data]) => [arm, { total: data.total, errors: data.errors, natural: data.natural }])), null, 2));
  return summary;
}

function run(command, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolveRun({ code, signal }));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: npm run eval:routing -- [--model sonnet] [--runs 2] [--case github] [--competition both|cli] [--out directory] [--prepare-only|--summarize-only]");
    return;
  }
  const booleanFlags = new Set(["--prepare-only", "--summarize-only"]);
  const valueFlags = new Set(["--out", "--model", "--runs", "--case", "--competition"]);
  for (let index = 0; index < args.length; index++) {
    if (booleanFlags.has(args[index])) continue;
    if (!valueFlags.has(args[index])) throw new Error(`Unknown option: ${args[index]}`);
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${args[index]}`);
    index++;
  }
  const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const outDir = resolve(value("--out", join(ROOT, "dev/.cache/routing-evals", new Date().toISOString().replaceAll(":", "-"))));
  const model = value("--model", "sonnet");
  const runs = value("--runs", "2");
  if (!Number.isInteger(Number(runs)) || Number(runs) < 1 || Number(runs) > 50) throw new Error("--runs must be an integer from 1 to 50");
  if (args.includes("--summarize-only")) { summarizeRoutingEval(outDir); return; }
  const cases = prepareRoutingEval(outDir, { caseName: value("--case"), competition: value("--competition", "both") });
  console.log(`Prepared ${cases.length} cases per arm at ${outDir}`);
  if (args.includes("--prepare-only")) return;
  const cli = join(ROOT, "dev/node_modules/.bin/claude");
  const env = { ...process.env, PATH: `./.eval-bin:${process.env.PATH ?? ""}` };
  const results = await Promise.all(["hooks", "no-hooks"].map(async (arm) => {
    const resultDir = join(outDir, "results", arm);
    return { arm, ...await run(cli, ["plugin", "eval", join(outDir, arm), "--ablation", "none", "--runs", runs, "--model", model, "--mocks", "record", "--trust-plugin", "--scaffold", "--keep-temp", "--allow-tools", "Bash(gh *)", "--no-publish", "--output-dir", resultDir, "--json", join(resultDir, "aggregate-result.json")], { cwd: outDir, env }) };
  }));
  write(join(outDir, "runner.json"), { model, runs: Number(runs), results });
  summarizeRoutingEval(outDir);
  console.log(`Results: ${outDir}/results`);
  if (results.some((entry) => entry.code !== 0)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

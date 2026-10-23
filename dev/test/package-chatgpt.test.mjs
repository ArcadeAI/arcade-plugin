// Checks the ZIP that dev/scripts/package-chatgpt.mjs builds for OpenAI's plugin
// portal (ChatGPT and Codex directory).

import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { archiveProblems, listingProblems, packageChatGPT } from "../scripts/package-chatgpt.mjs";
import { readRepoFile, ROOT } from "./helpers.mjs";

const plugin = JSON.parse(readRepoFile("plugin/plugin.json"));
const logo = plugin.extensions["com.openai"].interface.logo.replace(/^\.\//, "");

test("the OpenAI listing fits the portal's limits", () => {
  assert.deepEqual(listingProblems(plugin.extensions["com.openai"].interface), []);
});

test("listingProblems reports what final directory submission rejects", () => {
  const listing = plugin.extensions["com.openai"].interface;
  assert.deepEqual(listingProblems({ ...listing, shortDescription: "Your agent, every app you've connected." }), [
    "shortDescription is 39 characters; the limit is 30",
  ]);
  assert.deepEqual(listingProblems({ ...listing, longDescription: undefined }), ["longDescription is required"]);
  assert.deepEqual(listingProblems({ ...listing, defaultPrompt: ["Ask @arcade for my calendar"] }), [
    "defaultPrompt entry must not @mention an MCP server: Ask @arcade for my calendar",
  ]);
  assert.deepEqual(listingProblems({ ...listing, defaultPrompt: ["Hi  there", "Hi there"] }), ["defaultPrompt entries must be unique"]);
  assert.deepEqual(listingProblems({ ...listing, supportURL: undefined }), ["supportURL is required for a remote MCP submission"]);
  assert.deepEqual(listingProblems({ ...listing, termsOfServiceURL: undefined }), ["termsOfServiceURL is required for a remote MCP submission"]);
});

test("archiveProblems rejects hooks and apps on the manifest OpenAI reads", () => {
  assert.deepEqual(archiveProblems(plugin), []);
  const message = (key) => `plugin.json declares ${key}; OpenAI ZIP uploads can't include it`;
  assert.deepEqual(archiveProblems({ ...plugin, hooks: "./hooks/hooks.json" }), [message("hooks")]);
  assert.deepEqual(archiveProblems({ ...plugin, apps: "./.app.json" }), [message("apps")]);
  const openai = plugin.extensions["com.openai"];
  assert.deepEqual(archiveProblems({
    ...plugin,
    extensions: { "com.openai": { ...openai, hooks: "./hooks/hooks.json" } },
  }), [message("hooks")]);
  assert.deepEqual(archiveProblems({
    ...plugin,
    extensions: { "com.openai": { ...openai, apps: "./.app.json" } },
  }), [message("apps")]);
});

test("the directory listing has the four MCP URLs and five positive review cases", () => {
  const openai = plugin.extensions["com.openai"];
  assert.equal(openai.interface.supportURL, "https://support.arcade.dev");
  assert.equal(openai.interface.termsOfServiceURL, "https://www.arcade.dev/terms-of-service/");
  assert.equal(openai.interface.privacyPolicyURL, "https://www.arcade.dev/privacy-policy/");
  assert.ok(openai.interface.websiteURL?.startsWith("https://"));
  assert.equal(openai.review.test_cases.positive.length, 5);
  assert.equal(openai.review.test_cases.negative.length, 3);
  assert.equal(openai.review.commerce, false);
  assert.equal("demo_recording_url" in openai.review, false);
  assert.deepEqual(openai.publication.countries, ["US"]);
  assert.doesNotMatch(openai.publication.release_notes, /\d+\.\d+\.\d+/);
  assert.deepEqual(openai.review.test_cases.positive.map((item) => item.tools_triggered), [
    "Arcade_ListApps",
    "Arcade_SelectTools, Arcade_UseTool (Math.Avg)",
    "Arcade_SelectTools, Arcade_UseTool (Math.Power)",
    "Arcade_SelectTools, Arcade_UseTool (Math.Sqrt)",
    "Arcade_SelectTools, Arcade_UseTool (Math.DegToRad)",
  ]);
  for (const item of [...openai.review.test_cases.positive, ...openai.review.test_cases.negative]) {
    assert.match(item.prompt, /^Use Arcade to /, item.description);
  }
});

const hasUnzip = !spawnSync("unzip", ["-v"]).error;

test("the ZIP has plugin.json at its root and only the portable plugin", { skip: !hasUnzip && "unzip not found" }, () => {
  const work = mkdtempSync(path.join(tmpdir(), "arcade-chatgpt-"));
  try {
    const { path: zipPath, files } = packageChatGPT({ outDir: work });
    assert.equal(path.basename(zipPath), `arcade-chatgpt-${plugin.version}.zip`);

    // unzip -t checks every entry's CRC; -Z1 lists the names.
    const integrity = spawnSync("unzip", ["-tq", zipPath], { encoding: "utf8" });
    assert.equal(integrity.status, 0, integrity.stdout + integrity.stderr);
    const listed = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).stdout.trim().split("\n");
    assert.deepEqual(listed, files);

    for (const required of ["plugin.json", "mcp.json", "skills/try-arcade/SKILL.md", "skills/scale-arcade/SKILL.md", logo]) {
      assert.ok(listed.includes(required), `missing ${required}`);
    }
    for (const name of listed) {
      assert.doesNotMatch(name, /^(hooks|\.claude-plugin|\.cursor-plugin|com\.github\.copilot|clients|agents|commands)\//, `${name} should not ship`);
      assert.doesNotMatch(name, /\.app\.json$/, `${name}: app references can't be submitted`);
    }

    // The packed manifests still match the vendored Agent Plugins schemas.
    const out = path.join(work, "unpacked");
    assert.equal(spawnSync("unzip", ["-q", zipPath, "-d", out]).status, 0);
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const file of ["plugin.json", "mcp.json"]) {
      const validate = ajv.compile(JSON.parse(readRepoFile(`schemas/agent-plugins/1.0.0/${file.replace(".json", ".schema.json")}`)));
      assert.ok(validate(JSON.parse(readFileSync(path.join(out, file), "utf8"))), `${file}: ${ajv.errorsText(validate.errors)}`);
    }
    assert.deepEqual(readFileSync(path.join(out, logo)), readFileSync(path.join(ROOT, "plugin", logo)));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

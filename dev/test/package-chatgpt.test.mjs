// Checks the ZIP that dev/scripts/package-chatgpt.mjs builds for OpenAI's plugin
// portal (ChatGPT and Codex directory).

import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { archiveProblems, listingProblems, packageChatGPT } from "../scripts/package-chatgpt.mjs";
import { readRepoFile, ROOT } from "./helpers.mjs";

const plugin = JSON.parse(readRepoFile("plugin/plugin.json"));
const listingImages = ["logo", "logoDark", "composerIcon", "composerIconDark"].map((key) =>
  plugin.extensions["com.openai"].interface[key].replace(/^\.\//, ""),
);

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
  assert.deepEqual(listingProblems({ ...listing, brandColor: "#FFFFFF" }), [
    "brandColor must have at least 2:1 contrast against white",
  ]);
  assert.deepEqual(listingProblems({ ...listing, brandColor: "purple" }), ["brandColor must be a #RRGGBB color"]);
  assert.deepEqual(listingProblems({ ...listing, logoDark: "assets/logo-dark.png" }), [
    "logoDark must be a relative path starting with ./",
  ]);
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
  assert.equal(openai.interface.logo, "./assets/logo.png");
  assert.equal(openai.interface.logoDark, "./assets/logo-dark.png");
  assert.equal(openai.interface.composerIcon, "./assets/composer-icon.png");
  assert.equal(openai.interface.composerIconDark, "./assets/composer-icon-dark.png");
  assert.equal(openai.interface.brandColor, "#4708F9");
  assert.deepEqual(openai.review.test_cases.positive.map((item) => item.tools_triggered), [
    "Arcade_SelectTools",
    "Arcade_SelectTools, Arcade_UseTool (GoogleFlights.SearchFlights), Arcade_UseTool (Math.Multiply)",
    "Arcade_SelectTools, Arcade_UseTool (GoogleFinance.GetStockSummary)",
    "Arcade_SelectTools, Arcade_UseTool (Youtube.SearchForVideos)",
    "Arcade_SelectTools, Arcade_UseTool (Math.Avg)",
  ]);
  assert.deepEqual(openai.review.test_cases.positive.map((item) => item.prompt), [
    "Use Arcade to find tools that could help me plan a weekend trip to Chicago: flights, hotels and driving directions. Just list what's available, don't run anything yet.",
    "Use Arcade to find the cheapest one-way economy flight from SFO to JFK two weeks from today, then use Arcade's Math tools to calculate the total fare for 3 travelers.",
    "Use Arcade to get the Google Finance stock summary for NVDA.",
    "Use Arcade to search YouTube for videos explaining the Model Context Protocol.",
    "Use Arcade to average my monthly software bills: $1,249.50, $389.99, $72.25 and $418.26.",
  ]);
  assert.deepEqual(openai.review.test_cases.negative.map((item) => item.prompt), [
    "What's the difference between TCP and UDP?",
    "Send $50 to my landlord on Venmo.",
    "Explain what a P/E ratio means when evaluating a stock.",
  ]);
  for (const item of openai.review.test_cases.positive) {
    assert.deepEqual(Object.keys(item), ["description", "prompt", "tools_triggered", "expected_behavior"]);
    assert.ok(item.description.length <= 4000, item.description);
    assert.ok(item.expected_behavior.length > 0 && item.expected_behavior.length <= 4000);
    assert.equal(item.prompt.includes("\n"), false);
  }
  for (const item of openai.review.test_cases.negative) {
    assert.deepEqual(Object.keys(item), ["description", "prompt"]);
    assert.equal(item.prompt.includes("\n"), false);
    assert.doesNotMatch(item.prompt, /^Use Arcade to /);
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

    for (const required of ["plugin.json", "mcp.json", "skills/try-arcade/SKILL.md", "skills/scale-arcade/SKILL.md", ...listingImages]) {
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
    for (const image of listingImages) {
      const bytes = readFileSync(path.join(out, image));
      assert.deepEqual(bytes, readFileSync(path.join(ROOT, "plugin", image)));
      assertOpaqueSquarePng(bytes, image, image.startsWith("assets/composer-icon") ? 256 : 512);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
};

/** Square, RGBA or RGB, no tRNS, and no pixel with alpha below 255. */
const assertOpaqueSquarePng = (buf, label, pixels) => {
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", label);
  assert.ok(buf.length <= 5 * 1024 * 1024, `${label} is over 5 MiB`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  let transparentChunk = false;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "tRNS") {
      transparentChunk = true;
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(width, pixels, `${label} width`);
  assert.equal(height, pixels, `${label} height`);
  assert.equal(bitDepth, 8, `${label} bit depth`);
  assert.equal(transparentChunk, false, `${label} has a tRNS chunk`);
  // 2 = RGB, 6 = RGBA. Palette PNGs (color type 3) are what left a transparent
  // strip in the previous logo.
  assert.ok(colorType === 2 || colorType === 6, `${label} color type ${colorType}`);
  if (colorType === 2) return;
  const channels = 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = [];
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos];
    pos += 1;
    const row = Buffer.alloc(stride);
    const previous = y > 0 ? rows[y - 1] : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous ? previous[i] : 0;
      const upLeft = previous && i >= channels ? previous[i - channels] : 0;
      const sample = raw[pos + i];
      if (filter === 0) row[i] = sample;
      else if (filter === 1) row[i] = (sample + left) & 255;
      else if (filter === 2) row[i] = (sample + up) & 255;
      else if (filter === 3) row[i] = (sample + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (sample + paeth(left, up, upLeft)) & 255;
      else assert.fail(`${label} uses PNG filter ${filter}`);
    }
    pos += stride;
    rows.push(row);
    for (let x = 3; x < stride; x += 4) {
      assert.equal(row[x], 255, `${label} has a transparent pixel on row ${y}`);
    }
  }
};

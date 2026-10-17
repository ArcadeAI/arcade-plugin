#!/usr/bin/env node
// Builds the ZIP to upload in OpenAI's plugin portal (ChatGPT and Codex
// directory): dist/arcade-chatgpt-<version>.zip.
//
// The archive holds only the portable Agent Plugin, with plugin.json at the
// ZIP root: plugin.json, mcp.json, skills/, the listing images, and LICENSE.
// OpenAI reads the listing from extensions.com.openai in plugin.json. The other
// clients' folders (.claude-plugin/, .cursor-plugin/, com.github.copilot/) and
// the hook scripts stay out: plugin ZIPs with lifecycle hooks can't be
// submitted yet, and a second manifest folder would only add ambiguity.
//
// Usage: node scripts/package-chatgpt.mjs [--out <dir>]

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// From OpenAI's "Plugin submission errors" page
// (https://developers.openai.com/plugins/deploy/submission-errors).
export const LISTING_LIMITS = {
  displayName: 30,
  shortDescription: 30,
  longDescription: 4000,
};
export const MAX_DEFAULT_PROMPTS = 3;
export const MAX_DEFAULT_PROMPT_LENGTH = 128;

/** Returns every problem the portal would reject in the OpenAI listing. */
export const listingProblems = (listing) => {
  const problems = [];
  for (const [key, max] of Object.entries(LISTING_LIMITS)) {
    const value = listing[key];
    if (value === undefined) continue;
    if (value.length > max) problems.push(`${key} is ${value.length} characters; the limit is ${max}`);
    if (key !== "longDescription" && /[\r\n]/.test(value)) problems.push(`${key} must be one line`);
  }
  const prompts = listing.defaultPrompts ?? [];
  if (prompts.length > MAX_DEFAULT_PROMPTS) problems.push(`defaultPrompts has ${prompts.length} entries; the limit is ${MAX_DEFAULT_PROMPTS}`);
  if (new Set(prompts).size !== prompts.length) problems.push("defaultPrompts must be unique");
  for (const prompt of prompts) {
    if (prompt.length > MAX_DEFAULT_PROMPT_LENGTH || /[\r\n]/.test(prompt)) {
      problems.push(`defaultPrompts entry must be one line of at most ${MAX_DEFAULT_PROMPT_LENGTH} characters: ${prompt}`);
    }
  }
  return problems;
};

const listFiles = (root, dir) =>
  readdirSync(join(root, dir), { withFileTypes: true })
    // Skip dotfiles such as .DS_Store that a local checkout may hold.
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? listFiles(root, path) : [path];
    });

/** The paths, relative to the repo root, that go into the ZIP. */
export const packageFiles = (root = ROOT) => {
  const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
  const { logo, composerIcon } = plugin.extensions["com.openai"].interface;
  const images = [logo, composerIcon].filter(Boolean).map((path) => path.replace(/^\.\//, ""));
  return [...new Set(["plugin.json", "mcp.json", "LICENSE", ...listFiles(root, "skills"), ...images])];
};

// A fixed timestamp (1980-01-01, the earliest a ZIP can store) keeps the
// archive byte-for-byte the same for the same sources.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A minimal deflate ZIP writer, so packaging needs nothing beyond Node. */
const zip = (entries) => {
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, spec 2.0
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(DOS_TIME, 12);
    record.writeUInt16LE(DOS_DATE, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file, rw-r--r--
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
};

/** Writes the ZIP and returns its path and the paths inside it. */
export const packageChatGPT = ({ root = ROOT, outDir = join(root, "dist") } = {}) => {
  const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
  const version = readFileSync(join(root, "VERSION"), "utf8").trim();
  if (plugin.version !== version) {
    throw new Error(`plugin.json version ${plugin.version} does not match VERSION ${version}`);
  }
  const listing = plugin.extensions?.["com.openai"]?.interface;
  if (!listing) throw new Error("plugin.json has no extensions.com.openai.interface listing");
  const problems = listingProblems(listing);
  if (problems.length > 0) {
    throw new Error(`plugin.json extensions.com.openai.interface:\n- ${problems.join("\n- ")}`);
  }

  const files = packageFiles(root);
  for (const file of files) {
    if (!statSync(join(root, file), { throwIfNoEntry: false })?.isFile()) throw new Error(`${file} is missing`);
  }
  const archive = zip(files.map((name) => ({ name, data: readFileSync(join(root, name)) })));
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${plugin.name}-chatgpt-${version}.zip`);
  writeFileSync(path, archive);
  return { path, files };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIndex = process.argv.indexOf("--out");
  try {
    if (outIndex !== -1 && !process.argv[outIndex + 1]) throw new Error("--out needs a directory");
    const outDir = outIndex === -1 ? undefined : resolve(process.argv[outIndex + 1]);
    const { path, files } = packageChatGPT({ outDir });
    console.log(`${path} (${files.length} files)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

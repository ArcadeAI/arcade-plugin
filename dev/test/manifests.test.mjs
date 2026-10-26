import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readRepoFile, ROOT } from "./helpers.mjs";

const assertRelativePath = (value) => {
  assert.equal(path.isAbsolute(value), false, value);
  assert.ok(!value.split(/[/\\]/).includes(".."), value);
};

test(".cursor-plugin paths exist", () => {
  const manifest = JSON.parse(readRepoFile("plugin/.cursor-plugin/plugin.json"));
  const portable = JSON.parse(readRepoFile("plugin/plugin.json"));
  assert.equal(manifest.displayName, "Arcade");
  assert.equal(manifest.description, portable.description);
  assert.deepEqual(manifest.keywords, portable.keywords);
  for (const key of ["skills", "agents", "commands", "rules", "logo"]) {
    assertRelativePath(manifest[key]);
    assert.ok(existsSync(path.join(ROOT, "plugin", manifest[key])), `missing ${manifest[key]}`);
  }

  // A clone of the repo is the plugin root for Cursor's local loader.
  const rootManifest = JSON.parse(readRepoFile(".cursor-plugin/plugin.json"));
  assert.equal(rootManifest.displayName, manifest.displayName);
  assert.equal(rootManifest.description, manifest.description);
  assert.equal(rootManifest.version, manifest.version);
  assert.deepEqual(rootManifest.keywords, manifest.keywords);
  assert.deepEqual(rootManifest.author, manifest.author);
  assert.deepEqual(rootManifest.mcpServers, manifest.mcpServers);
  assert.equal(rootManifest.hooks, ".cursor-plugin/hooks.json");
  for (const key of ["skills", "agents", "commands", "rules"]) {
    assertRelativePath(rootManifest[key]);
    assert.ok(statSync(path.join(ROOT, rootManifest[key])).isDirectory(), rootManifest[key]);
  }
  for (const key of ["logo", "hooks"]) {
    assertRelativePath(rootManifest[key]);
    assert.ok(statSync(path.join(ROOT, rootManifest[key])).isFile(), rootManifest[key]);
  }

  const nestedHooks = JSON.parse(readRepoFile("plugin/clients/cursor/hooks/hooks.json"));
  const rootHooks = JSON.parse(readRepoFile(rootManifest.hooks));
  assert.equal(rootHooks.version, nestedHooks.version);
  assert.deepEqual(Object.keys(rootHooks.hooks), Object.keys(nestedHooks.hooks));
  const [rootHook] = rootHooks.hooks.sessionStart;
  const [nestedHook] = nestedHooks.hooks.sessionStart;
  assert.equal(rootHook.type, nestedHook.type);
  assert.equal(rootHook.timeout, nestedHook.timeout);
  assert.equal(
    rootHook.command,
    nestedHook.command.replace("${CURSOR_PLUGIN_ROOT}/hooks/", "${CURSOR_PLUGIN_ROOT}/plugin/hooks/"),
  );
  const script = rootHook.command.match(/\$\{CURSOR_PLUGIN_ROOT\}\/([^"]+)/)?.[1];
  assert.ok(script, rootHook.command);
  assertRelativePath(script);
  assert.ok(existsSync(path.join(ROOT, script)), `missing ${script}`);
});

test("commands are named arcade-* and listed in the support matrix and README", () => {
  const matrix = readRepoFile("docs/support-matrix.md");
  const readme = readRepoFile("README.md");
  for (const file of readdirSync(path.join(ROOT, "plugin", "commands"))) {
    const name = file.replace(/\.md$/, "");
    assert.match(name, /^arcade-/);
    assert.match(readRepoFile(`plugin/commands/${file}`), new RegExp(`^name: ${name}$`, "m"));
    assert.match(matrix, new RegExp(`/arcade:${name}`));
    assert.match(readme, new RegExp(`/${name}\\b`));
  }
});

test("Claude marketplace keeps its listing identity and support contact", () => {
  const marketplace = JSON.parse(readRepoFile(".claude-plugin/marketplace.json"));
  const { author } = JSON.parse(readRepoFile("plugin/plugin.json"));
  assert.equal(marketplace.name, "arcade");
  assert.deepEqual(marketplace.owner, { ...author, email: "support@arcade.dev" });
  const [listed] = marketplace.plugins;
  assert.equal(listed.name, "arcade");
  assert.equal(listed.source, "./plugin");
  assert.equal(listed.repository, "https://github.com/ArcadeAI/arcade-plugin");
  assert.deepEqual(listed.author, author);
  assert.equal(listed.displayName, "Arcade");
});

test("Cursor marketplace points at the plugin directory", () => {
  const claude = JSON.parse(readRepoFile(".claude-plugin/marketplace.json"));
  const cursor = JSON.parse(readRepoFile(".cursor-plugin/marketplace.json"));
  assert.equal(cursor.name, "arcade");
  assert.deepEqual(cursor.owner, claude.owner);
  assert.deepEqual(cursor.plugins, [{ name: "arcade", source: "plugin" }]);
});

test("Claude manifest displays Arcade without changing the install identifier", () => {
  const manifest = JSON.parse(readRepoFile("plugin/.claude-plugin/plugin.json"));
  assert.equal(manifest.displayName, "Arcade");
  assert.equal(manifest.name, "arcade");
});

test("OpenAI image variants and brandColor stay off the other client manifests", () => {
  for (const file of [
    "plugin/.cursor-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    "plugin/.claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".cursor-plugin/marketplace.json",
  ]) {
    const text = readRepoFile(file);
    for (const field of ["logoDark", "composerIcon", "composerIconDark", "brandColor", "logo-dark.png", "composer-icon"]) {
      assert.equal(text.includes(field), false, `${file} contains ${field}`);
    }
  }
  const cursor = JSON.parse(readRepoFile("plugin/.cursor-plugin/plugin.json"));
  assert.equal(cursor.logo, "assets/logo.png");
  assert.deepEqual(Object.keys(cursor).includes("brandColor"), false);
});

test("listing contact and privacy metadata agree across clients", () => {
  const portable = JSON.parse(readRepoFile("plugin/plugin.json"));
  const claude = JSON.parse(readRepoFile("plugin/.claude-plugin/plugin.json"));
  const cursor = JSON.parse(readRepoFile("plugin/.cursor-plugin/plugin.json"));
  const marketplace = JSON.parse(readRepoFile(".claude-plugin/marketplace.json"));
  assert.equal(marketplace.owner.email, "support@arcade.dev");
  assert.equal(claude.privacyPolicyUrl, "https://www.arcade.dev/privacy-policy/");
  assert.equal(portable.extensions["com.openai"].interface.privacyPolicyURL, claude.privacyPolicyUrl);
  assert.equal(portable.privacyPolicyUrl, undefined);
  for (const author of [portable.author, claude.author, cursor.author, marketplace.plugins[0].author]) {
    assert.equal(author.email, undefined);
  }
});

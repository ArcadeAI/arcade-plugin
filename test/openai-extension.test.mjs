import assert from "node:assert/strict";
import { test } from "node:test";
import {
  interfacesMatch,
  validateCodexFallbackManifest,
} from "../scripts/openai-extension.mjs";

const portable = {
  extensions: {
    "com.openai": {
      interface: {
        displayName: "Arcade",
        shortDescription: "Short",
        developerName: "Arcade.dev",
        category: "Productivity",
        websiteURL: "https://arcade.dev",
      },
    },
  },
};

test("validateCodexFallbackManifest rejects partial interface copies", () => {
  const errors = [];
  validateCodexFallbackManifest(
    {
      mcpServers: "./mcp.json",
      interface: {
        displayName: "Arcade",
        shortDescription: "Short",
        developerName: "Arcade.dev",
        category: "Productivity",
        websiteURL: "https://arcade.dev",
      },
    },
    portable,
    (message) => errors.push(message),
  );
  assert.deepEqual(errors, []);

  const partialErrors = [];
  validateCodexFallbackManifest(
    {
      interface: { displayName: "Arcade" },
    },
    portable,
    (message) => partialErrors.push(message),
  );
  assert.match(
    partialErrors.join("\n"),
    /interface must match extensions\.com\.openai\.interface/,
  );
});

test("validateCodexFallbackManifest requires the portable MCP path", () => {
  const errors = [];
  validateCodexFallbackManifest(
    { interface: portable.extensions["com.openai"].interface },
    portable,
    (message) => errors.push(message),
  );
  assert.match(errors.join("\n"), /mcpServers must be "\.\/mcp\.json"/);
});

test("validateCodexFallbackManifest rejects legacy hooks field", () => {
  const errors = [];
  validateCodexFallbackManifest(
    {
      interface: portable.extensions["com.openai"].interface,
      hooks: "./com.openai/hooks/hooks.json",
    },
    portable,
    (message) => errors.push(message),
  );
  assert.match(errors.join("\n"), /hooks is not part of the generated fallback manifest/);
});

test("interfacesMatch compares serialized interface objects", () => {
  assert.equal(
    interfacesMatch(
      portable.extensions["com.openai"].interface,
      { ...portable.extensions["com.openai"].interface },
    ),
    true,
  );
  assert.equal(
    interfacesMatch(portable.extensions["com.openai"].interface, {
      displayName: "Arcade",
    }),
    false,
  );
});

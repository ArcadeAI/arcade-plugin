/** Shared helpers for extensions.com.openai and the Codex fallback manifest. */

export const CODEX_HOOKS_PATH = "./com.openai/hooks/hooks.json";

export const CODEX_FALLBACK_ALLOWED_KEYS = new Set([
  "name",
  "description",
  "author",
  "homepage",
  "license",
  "keywords",
  "version",
  "interface",
  "hooks",
]);

export function readOpenAiInterface(portablePlugin) {
  return portablePlugin.extensions?.["com.openai"]?.interface ?? null;
}

export function interfacesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateCodexFallbackManifest(fallback, portablePlugin, report) {
  const openAiInterface = readOpenAiInterface(portablePlugin);

  if (fallback.hooks !== CODEX_HOOKS_PATH) {
    report(
      `.codex-plugin/plugin.json: hooks must be "${CODEX_HOOKS_PATH}"`,
    );
  }

  if (fallback.displayName) {
    report(
      ".codex-plugin/plugin.json: displayName must live under interface.displayName",
    );
  }

  if (!interfacesMatch(fallback.interface, openAiInterface)) {
    report(
      ".codex-plugin/plugin.json: interface must match extensions.com.openai.interface",
    );
  }

  for (const field of ["skills", "mcpServers", "displayName"]) {
    if (field in fallback) {
      report(
        `.codex-plugin/plugin.json: ${field} comes from the portable root manifest`,
      );
    }
  }

  for (const key of Object.keys(fallback)) {
    if (!CODEX_FALLBACK_ALLOWED_KEYS.has(key)) {
      report(`.codex-plugin/plugin.json: unexpected field "${key}"`);
    }
  }
}

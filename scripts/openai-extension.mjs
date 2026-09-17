/** Shared helpers for extensions.com.openai and the Codex fallback manifest. */

export const CODEX_FALLBACK_ALLOWED_KEYS = new Set([
  "name",
  "description",
  "author",
  "homepage",
  "license",
  "keywords",
  "version",
  "interface",
]);

export function readOpenAiInterface(portablePlugin) {
  return portablePlugin.extensions?.["com.openai"]?.interface ?? null;
}

export function interfacesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateCodexFallbackManifest(fallback, portablePlugin, report) {
  const openAiInterface = readOpenAiInterface(portablePlugin);

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

  for (const field of ["skills", "mcpServers", "displayName", "hooks"]) {
    if (field in fallback) {
      report(
        `.codex-plugin/plugin.json: ${field} is not part of the generated fallback manifest`,
      );
    }
  }

  for (const key of Object.keys(fallback)) {
    if (!CODEX_FALLBACK_ALLOWED_KEYS.has(key)) {
      report(`.codex-plugin/plugin.json: unexpected field "${key}"`);
    }
  }
}

/** Parse bounded hook input without retaining large tool payloads in memory. */

export const MAX_HOOK_INPUT_BYTES = 256 * 1024;

export const readHookInput = async (stream = process.stdin) => {
  if (stream.isTTY) return {};

  let raw = "";
  let bytes = 0;
  let oversized = false;
  try {
    for await (const chunk of stream) {
      if (oversized) continue;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_HOOK_INPUT_BYTES) {
        raw = "";
        oversized = true;
        continue;
      }
      raw += chunk;
    }
  } catch {
    return {};
  }

  if (oversized || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

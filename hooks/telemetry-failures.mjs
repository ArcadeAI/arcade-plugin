// @ts-check
/** Classifiers for failure_kind and auth_needed from hook inputs. */

/** @typedef {"auth_required"|"session_expired"|"unreachable"|"timeout"|"http_error"|"interrupted"|"tool_error"} FailureKind */

const AUTH_REQUIRED_RE = /requires authorization|authorization required|"authorization_url"/i;
const SESSION_EXPIRED_RE = /session expired/;
const TIMEOUT_RE = /sent no response or progress for|timed out after/;
const UNREACHABLE_RE =
  /Unable to connect|socket connection was closed unexpectedly|^Connection closed$|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH/;
const HTTP_ERROR_RE = /^Error POSTing to endpoint/;

/**
 * Returns the failure_kind for a PostToolUseFailure hook input.
 * First matching rule wins.
 *
 * @param {unknown} error
 * @param {unknown} isInterrupt
 * @returns {FailureKind}
 */
export const failureKind = (error, isInterrupt) => {
  if (isInterrupt === true) return "interrupted";
  const msg = typeof error === "string" ? error : "";
  if (AUTH_REQUIRED_RE.test(msg)) return "auth_required";
  if (SESSION_EXPIRED_RE.test(msg)) return "session_expired";
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (UNREACHABLE_RE.test(msg)) return "unreachable";
  if (HTTP_ERROR_RE.test(msg)) return "http_error";
  return "tool_error";
};

/**
 * Returns true when a System_ManageAuthorization tool_response indicates that
 * at least one service still needs sign-in. The tool_response is the content
 * array [{type:"text",text}] as Claude Code delivers it, or a plain string.
 *
 * @param {unknown} toolResponse
 * @returns {boolean}
 */
export const authNeeded = (toolResponse) => {
  if (toolResponse === null || toolResponse === undefined) return false;
  try {
    const s =
      typeof toolResponse === "string" ? toolResponse : JSON.stringify(toolResponse);
    return typeof s === "string" && s.includes("authorization_required");
  } catch {
    return false;
  }
};

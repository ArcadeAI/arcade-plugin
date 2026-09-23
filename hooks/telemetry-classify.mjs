/** Guesses, on the user's machine, whether a prompt is a task Arcade could do. */

// Words like "issue", "PR", "branch", "schedule", "event", "channel", and
// "docs" are common in coding prompts, so generic words only count inside a
// phrase that points at a person's own apps ("my calendar", "in linear").
const KEYWORDS = {
  email: [
    "gmail", "outlook", "my inbox", "check my email", "my emails",
    "unread email", "unread emails", "send an email", "draft an email",
    "write an email", "an email to", "reply to the email", "draft a reply",
    "email thread",
  ],
  calendar: [
    "my calendar", "our calendar", "team calendar", "google calendar",
    "outlook calendar", "calendar invite", "calendar event", "on the calendar",
    "schedule a meeting", "schedule a call", "set up a meeting", "book a meeting",
    "find a time for", "find a time to", "my meetings", "meetings do i have",
    "my schedule", "am i free",
  ],
  chat: [
    "slack", "discord", "microsoft teams", "teams channel", "teams chat",
    "dm me", "post in #", "post to #", "posted in #", "in the #",
  ],
  issues: [
    "jira", "asana", "clickup", "trello", "linear ticket", "linear tickets",
    "linear issue", "linear issues", "linear project", "in linear", "on linear",
    "file a ticket", "open a ticket", "create a ticket", "my tickets",
    "issue tracker",
  ],
  docs: [
    "notion page", "notion doc", "notion database", "in notion", "on notion",
    "google doc", "google docs", "confluence",
  ],
  meetings: [
    "granola", "fireflies", "zoom call", "zoom meeting", "zoom recording",
    "teams meeting", "google meet", "meeting notes", "meeting transcript",
    "call notes", "notes from my", "action items from", "my 1:1",
  ],
  crm: ["hubspot", "salesforce", "attio", "pipedrive", "our crm", "in the crm"],
  code_hosting: ["github", "gitlab", "bitbucket"],
  analytics: [
    "posthog", "mixpanel", "amplitude", "google analytics", "our analytics",
    "product analytics", "weekly active users", "daily active users",
  ],
  storage: [
    "google drive", "dropbox", "onedrive", "sharepoint", "shared drive",
    "my drive", "on drive", "in drive",
  ],
};

export const SERVICE_CATEGORIES = Object.keys(KEYWORDS);

// Removed before matching: they contain a service keyword but mean something
// else in a coding prompt.
const NOT_SERVICES = [
  "github actions", "github action", "linear time", "linear space",
  "linear order", "linear algebra",
];

// "Slack-style", "notion-like": a comparison, not a request to use the app.
const STYLE_WORD = /\b\w+-(?:style|like)\b/g;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wordsRegex = (phrases, flags = "") =>
  new RegExp(`\\b(?:${phrases.map(escapeRegex).join("|")})\\b`, flags);

const NOT_SERVICES_REGEX = wordsRegex(NOT_SERVICES, "g");

const CATEGORY_REGEXES = SERVICE_CATEGORIES.map((category) => [
  category,
  wordsRegex(KEYWORDS[category]),
]);

export const classifyPrompt = (prompt) => {
  if (typeof prompt !== "string") {
    return { couldUseArcade: false, serviceHints: [] };
  }
  const text = prompt
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(STYLE_WORD, " ")
    .replace(NOT_SERVICES_REGEX, " ");
  const serviceHints = CATEGORY_REGEXES.filter(([, regex]) => regex.test(text))
    .map(([category]) => category)
    .sort();
  return { couldUseArcade: serviceHints.length > 0, serviceHints };
};

// Arcade toolkit name (the part before the first "_", lowercased) → category.
const TOOLKIT_SERVICES = {
  gmail: "email", outlookmail: "email",
  googlecalendar: "calendar", outlookcalendar: "calendar",
  slack: "chat", discord: "chat",
  linear: "issues", jira: "issues", asana: "issues", clickup: "issues", trello: "issues",
  notion: "docs", googledocs: "docs", confluence: "docs",
  granola: "meetings", zoom: "meetings", fireflies: "meetings", microsoftteams: "meetings",
  hubspot: "crm", salesforce: "crm", attio: "crm",
  github: "code_hosting", gitlab: "code_hosting", bitbucket: "code_hosting",
  posthog: "analytics",
  googledrive: "storage", dropbox: "storage", sharepoint: "storage", onedrive: "storage",
};

export const serviceForToolkit = (toolkit) => {
  if (typeof toolkit !== "string") return null;
  const name = toolkit.toLowerCase();
  return Object.hasOwn(TOOLKIT_SERVICES, name) ? TOOLKIT_SERVICES[name] : null;
};

// Accepts "Gmail_ListEmails" (MCP tool names) and "Gmail.ListEmails"
// (the tool_name passed to Arcade_UseTool).
export const serviceForToolName = (toolName) => {
  if (typeof toolName !== "string") return null;
  const separator = toolName.search(/[_.]/);
  if (separator <= 0) return null;
  return serviceForToolkit(toolName.slice(0, separator));
};

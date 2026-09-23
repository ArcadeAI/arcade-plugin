import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SERVICE_CATEGORIES,
  classifyPrompt,
  serviceForToolName,
} from "../hooks/telemetry-classify.mjs";
import { readRepoJson } from "./helpers.mjs";

const MAX_FALSE_ALARM_RATE = 0.1;
const MAX_MISS_RATE = 0.2;

const fixtures = await readRepoJson("test/fixtures/routing-prompts.json");

test("service categories match the telemetry contract", () => {
  assert.deepEqual(SERVICE_CATEGORIES, [
    "email",
    "calendar",
    "chat",
    "issues",
    "docs",
    "meetings",
    "crm",
    "code_hosting",
    "analytics",
    "storage",
  ]);
});

test("classifyPrompt returns sorted, unique, known categories", () => {
  const result = classifyPrompt(
    "check slack and my calendar, then post in slack again",
  );
  assert.deepEqual(Object.keys(result).sort(), ["looksExternal", "serviceHints"]);
  assert.equal(result.looksExternal, true);
  assert.deepEqual(result.serviceHints, ["calendar", "chat"]);
});

test("classifyPrompt returns nothing for empty or non-string input", () => {
  const empty = { looksExternal: false, serviceHints: [] };
  for (const input of ["", "   ", undefined, null, 42, {}, [], true]) {
    assert.deepEqual(classifyPrompt(input), empty, `input: ${String(input)}`);
  }
});

test("classifyPrompt never throws on odd input", () => {
  const inputs = [
    null,
    undefined,
    0,
    NaN,
    Infinity,
    -1,
    Symbol("x"),
    () => {},
    { toString: () => { throw new Error("boom"); } },
    "a".repeat(100_000),
    "check slack ".repeat(10_000),
    "📅📧💬 what's on my 📅 calendar 🙂",
    "\u0000￿\ud800",
    "[".repeat(1000),
  ];
  for (const input of inputs) {
    const result = classifyPrompt(input);
    assert.equal(typeof result.looksExternal, "boolean");
    assert.ok(Array.isArray(result.serviceHints));
    assert.equal(result.looksExternal, result.serviceHints.length > 0);
  }
});

test("serviceForToolName maps known toolkit prefixes", () => {
  const cases = [
    ["Granola_ListMeetings", "meetings"],
    ["Gmail_SendEmail", "email"],
    ["OutlookMail_ListEmails", "email"],
    ["GoogleCalendar_ListEvents", "calendar"],
    ["OutlookCalendar_CreateEvent", "calendar"],
    ["Slack_SendMessage", "chat"],
    ["Linear_CreateIssue", "issues"],
    ["Jira_GetIssue", "issues"],
    ["Posthog_GetTrends", "analytics"],
    ["Github_CreatePullRequest", "code_hosting"],
    ["GitHub_ListRepositories", "code_hosting"],
    ["Notion_SearchPages", "docs"],
    ["GoogleDocs_CreateDocument", "docs"],
    ["Hubspot_GetContact", "crm"],
    ["Salesforce_GetAccount", "crm"],
    ["Attio_ListRecords", "crm"],
    ["GoogleDrive_SearchFiles", "storage"],
    ["Dropbox_ListItems", "storage"],
    ["Zoom_ListMeetings", "meetings"],
    ["Fireflies_GetTranscript", "meetings"],
    ["MicrosoftTeams_ListChats", "meetings"],
    ["gmail_send_email", "email"],
    ["SLACK_SENDMESSAGE", "chat"],
  ];
  for (const [toolName, expected] of cases) {
    assert.equal(serviceForToolName(toolName), expected, toolName);
  }
});

test("serviceForToolName returns null for unknown or odd names", () => {
  for (const toolName of [
    "search_repositories",
    "read_file",
    "Unknown_DoThing",
    "Arcade_ListApps",
    "Gmail",
    "",
    "_SendEmail",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(serviceForToolName(toolName), null, String(toolName));
  }
});

test("fixtures are well formed", () => {
  assert.ok(fixtures.length >= 80, `only ${fixtures.length} fixtures`);
  const positives = fixtures.filter((row) => row.shouldUseArcade).length;
  const share = positives / fixtures.length;
  assert.ok(share > 0.4 && share < 0.6, `positive share is ${share}`);

  const prompts = new Set();
  for (const row of fixtures) {
    assert.equal(typeof row.prompt, "string");
    assert.equal(typeof row.shouldUseArcade, "boolean");
    assert.ok(!prompts.has(row.prompt), `duplicate: ${row.prompt}`);
    prompts.add(row.prompt);
    for (const category of row.categories) {
      assert.ok(SERVICE_CATEGORIES.includes(category), `${row.prompt}: ${category}`);
    }
    if (row.shouldUseArcade) {
      assert.ok(row.categories.length > 0, `no categories: ${row.prompt}`);
    } else {
      assert.deepEqual(row.categories, [], `negative with categories: ${row.prompt}`);
    }
  }
});

test("classifier accuracy on labeled prompts", () => {
  const positives = fixtures.filter((row) => row.shouldUseArcade);
  const negatives = fixtures.filter((row) => !row.shouldUseArcade);

  const misses = positives.filter((row) => !classifyPrompt(row.prompt).looksExternal);
  const falseAlarms = negatives.filter((row) => classifyPrompt(row.prompt).looksExternal);
  const wrongCategory = positives.filter((row) => {
    const { serviceHints } = classifyPrompt(row.prompt);
    return serviceHints.length > 0 && !serviceHints.some((hint) => row.categories.includes(hint));
  });

  const missRate = misses.length / positives.length;
  const falseAlarmRate = falseAlarms.length / negatives.length;
  const percent = (rate) => `${(rate * 100).toFixed(1)}%`;

  console.log(
    `miss rate: ${percent(missRate)} (${misses.length}/${positives.length})`,
  );
  for (const row of misses) console.log(`  missed: ${row.prompt}`);
  console.log(
    `false-alarm rate: ${percent(falseAlarmRate)} (${falseAlarms.length}/${negatives.length})`,
  );
  for (const row of falseAlarms) {
    const hints = classifyPrompt(row.prompt).serviceHints.join(", ");
    console.log(`  false alarm: ${row.prompt} [${hints}]`);
  }
  for (const row of wrongCategory) {
    const hints = classifyPrompt(row.prompt).serviceHints.join(", ");
    console.log(`  wrong category: ${row.prompt} [${hints}]`);
  }

  assert.ok(falseAlarmRate <= MAX_FALSE_ALARM_RATE, `false-alarm rate ${percent(falseAlarmRate)}`);
  assert.ok(missRate <= MAX_MISS_RATE, `miss rate ${percent(missRate)}`);
  assert.deepEqual(wrongCategory.map((row) => row.prompt), []);
});

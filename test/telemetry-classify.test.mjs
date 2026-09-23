import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SERVICE_CATEGORIES,
  classifyPrompt,
  serviceForToolName,
} from "../hooks/telemetry-classify.mjs";
import { readRepoJson } from "./helpers.mjs";

const fixtures = await readRepoJson("test/fixtures/routing-prompts.json");

test("classifyPrompt returns sorted known categories and never throws", () => {
  assert.deepEqual(SERVICE_CATEGORIES, [
    "email", "calendar", "chat", "issues", "docs",
    "meetings", "crm", "code_hosting", "analytics", "storage",
  ]);
  assert.deepEqual(classifyPrompt("check slack and my calendar, then slack again"), {
    couldUseArcade: true,
    serviceHints: ["calendar", "chat"],
  });
  const odd = ["", "   ", undefined, null, 42, {}, Symbol("x"), "[".repeat(1000), "\u0000\ud800"];
  for (const input of odd) {
    assert.deepEqual(classifyPrompt(input), { couldUseArcade: false, serviceHints: [] });
  }
});

test("serviceForToolName maps toolkit prefixes, case-insensitive", () => {
  const cases = [
    ["Gmail_SendEmail", "email"], ["GoogleCalendar.ListEvents", "calendar"],
    ["SLACK_SENDMESSAGE", "chat"], ["Linear_CreateIssue", "issues"],
    ["Notion_SearchPages", "docs"], ["Granola_ListMeetings", "meetings"],
    ["Hubspot_GetContact", "crm"], ["GitHub_ListRepositories", "code_hosting"],
    ["Posthog_GetTrends", "analytics"], ["GoogleDrive_SearchFiles", "storage"],
    ["Arcade_ListApps", null], ["Unknown_DoThing", null], ["Gmail", null],
    ["_SendEmail", null], ["constructor_x", null], [undefined, null],
  ];
  for (const [toolName, expected] of cases) {
    assert.equal(serviceForToolName(toolName), expected, String(toolName));
  }
});

test("classifier accuracy on labeled prompts", () => {
  const positives = fixtures.filter((row) => row.couldUseArcade);
  const negatives = fixtures.filter((row) => !row.couldUseArcade);
  const misses = positives.filter((row) => !classifyPrompt(row.prompt).couldUseArcade);
  const falseAlarms = negatives.filter((row) => classifyPrompt(row.prompt).couldUseArcade);
  const wrongCategory = positives.filter((row) => {
    const { serviceHints } = classifyPrompt(row.prompt);
    return serviceHints.length > 0 && !serviceHints.some((hint) => row.categories.includes(hint));
  });

  const percent = (part, whole) => `${((part.length / whole.length) * 100).toFixed(1)}%`;
  console.log(`miss rate: ${percent(misses, positives)} (${misses.length}/${positives.length})`);
  for (const row of misses) console.log(`  missed: ${row.prompt}`);
  console.log(
    `false-alarm rate: ${percent(falseAlarms, negatives)} (${falseAlarms.length}/${negatives.length})`,
  );
  for (const row of falseAlarms) console.log(`  false alarm: ${row.prompt}`);

  assert.ok(falseAlarms.length / negatives.length <= 0.1, "false-alarm rate above 10%");
  assert.ok(misses.length / positives.length <= 0.2, "miss rate above 20%");
  assert.deepEqual(wrongCategory.map((row) => row.prompt), [], "wrong category");
});

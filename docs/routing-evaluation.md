# Evaluate routing on controlled tasks

Run `npm run eval:routing` to compare the prompt keyword classifier against
[16 separately labeled cases](../test/fixtures/routing-evaluation.json). These
agent-authored labels need human review before PM reporting. They were written
separately from the classifier's tuning fixtures; independence does not establish
label correctness. Do not tune on these cases and then report them as an unseen
evaluation. Add a new held-out set when tuning uses them.

Each case labels whether connected app access through Arcade is appropriate.
Multi-turn cases label the final request using the preceding conversation. The
lexical baseline tests only the final prompt, so it cannot resolve a confirmation
from prior context. This baseline measures neither the contextual scope gate nor
a client's routing decisions.

The default report has no client observations. Zero observed cases produces a
null rate, not zero success. The report includes known lexical false positives
from local coding tasks that mention an app and false negatives from confirmations.
Keep those cases visible rather than changing the labels to match the classifier.

## Record a client run

Run each case in a fresh, controlled session with the installed plugin version
recorded in your local evidence. Send the case's turns in order. For write actions,
use a test account and approve the exact action before execution. Record the client
decision and tool result separately; verify the requested result before assigning
a known task outcome. Preserve a local transcript or event capture as evidence.

Import your records with:

```sh
npm run eval:routing -- --observations /absolute/local/observations.json
```

The import has this format. This record is an example, not a client result:

```json
{
  "datasetVersion": 1,
  "records": [{
    "caseId": "inbox-triage",
    "client": "claude-code",
    "recordedAt": "2026-09-29T12:00:00Z",
    "evidence": "/local/run/transcript.txt",
    "selection": "arcade_plugin",
    "attempt": "attempted",
    "toolResult": "completed",
    "blocker": "none",
    "taskOutcome": "unknown"
  }]
}
```

Use one record per case and client. Supported clients are `claude-code` and
`copilot-cli`; their results stay separate. Omit unrun cases. For a run with
incomplete capture, use `unknown` fields instead of assuming no call happened.
The evaluator checks record consistency and required evidence references; a human
must inspect the referenced evidence to confirm the observation.

| Field | Values |
| --- | --- |
| `selection` | `arcade_plugin`, `arcade_connection`, `other`, `none`, `unknown` |
| `attempt` | `attempted`, `not_attempted`, `unknown`; describes an Arcade attempt |
| `toolResult` | `completed`, `failed`, `not_attempted`, `unknown`; describes the Arcade call |
| `blocker` | `none`, `auth`, `setup`, `other`, `unknown` |
| `taskOutcome` | `succeeded`, `failed`, `unknown` |
| `taskOutcomeEvidence` | Required local verification reference when the outcome is known |

A selected Arcade connection can have no attempt, such as when setup blocks the
call. A completed tool can leave the task outcome unknown, such as when a search
returns results without establishing whether they answer the user's question.

## Read the rates

Every rate includes its numerator and denominator. Rates are fractions from 0 to 1;
null means the denominator is empty.

| Rate | Numerator | Denominator |
| --- | --- | --- |
| Lexical recall | Positive classifier results on appropriate cases | All appropriate labeled cases |
| Lexical false-positive rate | Positive classifier results on inappropriate cases | All inappropriate labeled cases |
| Arcade selected | Plugin or alternate Arcade selection | Observed appropriate cases with known selection |
| Arcade attempted | Observed Arcade attempts | Observed appropriate cases with known attempt status |
| Tool completed | Completed Arcade calls | Arcade attempts with an observed completed or failed result |
| Task succeeded | Verified successful tasks | Observed appropriate cases with known task outcomes |

Unrun cases, unknown task outcomes, attempts without results, inappropriate Arcade
attempts, and auth/setup blockers appear as separate counts. Unknown outcomes never
enter the task-success denominator. Blocked tasks are not silently removed from
the routing denominator when the client decision is known.

Production relevant-work telemetry has a different denominator: observed relevant
work, rather than every prompt. A scoped production event cannot establish routing
recall on all eligible tasks, including tasks the relevance classifier missed.
Use this controlled evaluation for that question. The evaluator reads local files
and prints JSON; it sends no prompts, transcripts, or observations to analytics.

Written by Strider, Teal's agent. Labels awaiting human review.

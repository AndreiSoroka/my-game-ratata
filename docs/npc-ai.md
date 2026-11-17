# NPC reasoning through Codex CLI

Mira and Kaplya can optionally use the locally installed Codex CLI to choose
ordinary character intentions. The backend owns the event queue, controller lease,
action results and session memory; a model call never blocks the simulation tick.
Every resulting action still uses `GameCharacter` and the shared authoritative
movement, collision, conversation and life-cycle rules.

## Run locally

Use Bun 1.4.4 and an installed Codex CLI supporting non-interactive JSON Schema
output (the integration was checked with CLI 0.166.0). Authenticate Codex normally;
the backend uses that existing login:

```sh
codex login
GAME_AI_ENABLED=1 bun run dev:backend
```

Without the exact `GAME_AI_ENABLED=1` flag, both NPCs retain their scripted
behavior and no model is called. Start the frontend normally as described in
[Playable world](playable-world.md). Speak normally within 80 world units and line
of sight. The current E selection is a hint, followed by your companion; otherwise
one listener responds, or several may ask whom you mean. An NPC explicitly agrees
before accepting or replacing an errand. Small talk preserves its route and task
budget. AI follow/help/guard/wait/dismiss requests use chat and existing consent rules.
Q toggles selection between yourself and no target.

Use **Шёпот** within 48 units for a private conversation. **Обменяться** opens a
voluntary two-sided offer and the same private chat. Real unequipped items, stack
quantities and integer gold remain in bags until both participants confirm one
revision. Gifts are allowed. Enter in chat sends text; it never confirms a deal.
Changed offers/resources clear confirmations; death, disconnect or lost reach
cancels without transferring anything. Other players cannot read the offers or
private conversation. Conversations do not steal the receiver's keyboard focus.

No MCP registration, `GAME_AGENT_TOKEN`, API key or global Codex configuration
change is required for the existing ChatGPT login. The subprocess runs in a
disposable directory with shell/code execution, web search, plugins, hooks,
skills and user coding instructions disabled. It receives a compact earned
observation through stdin and returns a structured decision. The separate
[external agent MCP bridge](playable-world.md#external-agent-mcp) remains available
and cannot override an active exclusive NPC controller lease.

## Configuration

Edit [`apps/backend/config/npc-ai.json`](../apps/backend/config/npc-ai.json).
Settings apply after a backend restart. For a built backend, rebuild after changing
the bundled default configuration, or select an external configuration file:

```sh
GAME_AI_ENABLED=1 GAME_AI_CONFIG=/absolute/path/npc-ai.local.json bun run dev:backend
```

`GAME_AI_CONFIG` replaces the default file. Relative paths resolve against the
backend process's current working directory (`apps/backend` when started through
`bun run dev:backend`); an absolute path avoids ambiguity. The override is ignored
while AI is disabled.

| Setting                      | Default      | Meaning                                                               |
| ---------------------------- | ------------ | --------------------------------------------------------------------- |
| `defaults.cliPath`           | `codex`      | Executable path or name found through `PATH`; no shell command string |
| `defaults.model`             | `gpt-6-luna` | Explicit model for every invocation                                   |
| `defaults.reasoningEffort`   | `medium`     | Reasoning effort supported by the selected model                      |
| `defaults.serviceTier`       | `default`    | Standard speed; `fast` is an explicit opt-in                          |
| `defaults.timeoutMs`         | `60000`      | Maximum time for one CLI response                                     |
| `limits.maxCallsPerHour`     | `120`        | Shared rolling-hour call limit, including retries                     |
| `limits.maxDecisionsPerTask` | `12`         | Maximum model decisions for one task                                  |
| `limits.reviewIntervalMs`    | `60000`      | Mira's regular autonomous review interval                             |
| `limits.retryDelayMs`        | `5000`       | Delay before the single retry of a failed call                        |

Each `npcs` entry has `actorId`, `role` and optional `settings` overriding the
global model settings. For example, this keeps Mira on the economical defaults
while giving Kaplya a shorter invocation timeout:

```json
{
    "defaults": {
        "model": "gpt-6-luna",
        "reasoningEffort": "medium",
        "serviceTier": "default"
    },
    "npcs": [
        {
            "actorId": "npc_friendly_girl_1",
            "role": "city_coordinator"
        },
        {
            "actorId": "npc_magic_slime_1",
            "role": "companion",
            "settings": { "timeoutMs": 45000 }
        }
    ]
}
```

The selected model must be available to the CLI login. Global model, speed and
`ultra` settings are not inherited. Provider failures receive at most one retry;
there is no automatic fallback to a more expensive model. Repeated failures
release the lease and restore scripted behavior. A room stop aborts pending CLI
processes; death, identity replacement and cancellation invalidate late replies.

## Current character behavior

- **Mira** reviews authorized city stock, actual worker requests and worker idle
  reasons. She can inspect residents, walk through the city and offer validated
  quests to connected players. Idle review results are remembered rather than
  holding workers in repeated conversations.
- **Kaplya** converses and accepts peaceful errands. For a merchant errand she
  physically enters the shop, interacts, retains observed offers, returns and
  answers. Errands own movement temporarily; existing following between locations
  remains available after consent.
- Both use the same `GameCharacter` rules. No generated prose creates property,
  progress, damage, consent or rewards. New AI errands stay inside the city.

## Quest proposals and rewards

A model can propose a declarative delivery, visit, hostile-defeat or inspection
objective. The server checks references, reachability, authority and real funding,
then shows its approved terms in a modal. **Взять** accepts a specific offer and
revision in the existing shared contract slot. Gold distribution is fixed then;
item rewards go to the person turning in. Only authoritative post-acceptance
movement, kills and successful inspections advance those objectives; deliveries
may use previously owned items. Delivery, reward items and money settle atomically.

Mira's municipal fund defaults to 300 gold per city session in authored world data.
It is separate from her wallet and cannot be looted or replenished by the model.
Personal rewards use the issuer's actual wallet and unequipped items. Accepting
reserves the reward against voluntary use; theft can still remove a promised
item. A missing reward requires new approved terms rather than invented
compensation. Cancellation frees reservations once; issuer death cancels new
contracts before ordinary death loot. Completed settlements have stable receipts.

Published worker requests in Mira's dialogue and the guild come from the same
`WorkerRequestService`. Accepting one preserves the existing incident, trophy,
physical work verification, return and payout chain. Model inspections close only
their own conversation and do not hold farmers still. Empty seed supply, occupied
plots, sufficient stock, work breaks and threats have explicit server reasons.

Observations filter distance, line of sight and building interiors. Kaplya does
not receive a merchant's assortment before a validated nearby interaction; a
retained merchant fact records when it was observed. Mira's city ledger is an
explicit role permission, not unrestricted world knowledge. Private replies check
the recipient again and are not broadcast to other players. A moving requester
is located through earned observations and the last known meeting position.

An accepted command is not a completed errand. The coordinator waits for actual
arrival or an explicit blocked/cancelled/failure result before selecting another
step. One subprocess runs at a time, with player requests ahead of autonomous
reviews. The active model lease is renewed independently of response latency;
scripted behavior cannot simultaneously replace its route. Conversation memory,
tasks and learned facts last only for the current world session, and are reset for
a replacement identity. This is not durable world persistence.

## Feedback and operating cost

The CLI prints `NPC AI CLI` telemetry with character ID, model, elapsed time,
outcome and available token usage. Usage is retained even when a completed model
reply fails local validation. It does not print the full prompt or credentials.

The coordinator appends local feedback to
`apps/backend/logs/npc-ai.jsonl` (ignored by Git). Each versioned JSONL entry has
`worldSessionId`, `at`, `actorId`, `taskId`, a bounded `request`, `category` and
`source`. Categories distinguish model feedback, completed/rejected/failed actions, provider
errors and task limits. `source: "model"` identifies a model's interpretation;
`source: "server"` identifies a validated rejection or runtime result. Entries can
also include an action summary, reason and action receipt ID. Logging is bounded
and deduplicated so repeated identical feedback does not flood the file.

The model may return up to four diagnostics alongside its next lawful action:

```json
{
    "kind": "uncertain",
    "capability": "merchant_information",
    "detail": "The merchant is not visible yet; this does not prove that the service is missing.",
    "attempted": "Approach the observed shop entrance and inspect again."
}
```

Diagnostic kinds are `missing_capability`, `blocked` and `uncertain`.
`capability` is limited to 100 characters; `detail` and `attempted` to 400 each.
An absent controller intention is different from an absent engine mechanic, and a
refused action can simply reflect personality, ownership, reach or stale state.
Use these records to identify useful improvements to tasks, controller commands
and scripts after checking the server evidence. Feedback does not edit code,
create new tools or override game rules automatically. The model is instructed to
try bounded lawful alternatives and report honest failure if none remains.

The first new diagnostic in a turn can also be spoken privately to a nearby
requester while the NPC attempts its chosen action. Speech still checks reach and
visibility. Successful alternatives receive server-authored action receipts in
the log, so a claimed attempt can be compared with its actual outcome.

## Verification

Deterministic tests use a substitute provider and ordinary validated commands for
the merchant walk, earned information, return and private reply. They also cover
Mira's response to real city changes, leases, stale replies, cancellation,
ownership, privacy and provider failures. Browser checks remain headless.

A live local check with `gpt-6-luna`, reasoning `medium`, verified a private
conversation, Kaplya's physical merchant errand (arrival, interaction and return
receipts), and a voluntary gift of her existing food through a revision-confirmed
exchange. Server snapshots confirmed the transferred instance and exchange receipt.
These observations are separate from deterministic tests; model behavior and
latency vary. The world and its agreements remain process memory only.

## Communication and negotiation

Public conversation does not take over the movement controller: following or an
accepted route continues while the CLI prepares a conversational response. An
explicitly accepted `wait` order persists after the call ends. By default the
companion stays until asked again; explicit “until I return” arms a return rule
only after its owner actually leaves. “Show me the guild” can use a guide intent
against the authored building entrance; arrival still requires real navigation.

Dead NPCs abort queued/in-flight work and stop using AI. Revival requires a new
player request before AI resumes; old tasks and delayed results are discarded.
The 120-call hourly budget reserves an interactive portion: at most 80 background
calls at the default limit. Blocked fresh requests receive an immediate private
status. Nearby typing/thinking dots represent pending replies, not an active
Spark or an autonomous background review.

Trade offers have separate proposal revisions and exact request acknowledgements.
A partner update cannot discard a local draft. Only submitted terms are visible
to the partner, and both sides confirm the global deal revision. Empty inventories
or offers do not justify closing negotiation: an NPC can receive a gift or decline
terms while leaving the window open. Changes still clear both confirmations and
atomic settlement retains the real item identities/condition and wallet rules.

Workers keep reachable separate waiting places around the current clerk and
follow a moving Mira through ordinary navigation. Their inspection and selected
target status use the actual work intent, incident stage, worksite and last action
receipt. AI inspection closes only its own dialogue and cannot hold the worker.

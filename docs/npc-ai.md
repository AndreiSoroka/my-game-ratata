# NPC reasoning through Codex CLI

Mira, Kaplya and Sister Vera can optionally use the locally installed Codex CLI to choose
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

One pending offer cannot replace another. An occupied group contract slot prevents
new offers; another request is needed after resolution. Whisper inside the offer
can negotiate real gold and the issuer's own unequipped items. Accepted terms have
an exact revision. Paid reconnaissance requires a meaningful inquiry and at least
16 tiles of reachable path when offered and accepted; opening ordinary dialogue
does not count as an inquiry.

Accepted unfinished quests appear only in the character window's **Квесты** tab.
WASD remains available while reading that tab. Say **«квест готов»** near the actual
issuer to open the server-owned confirmation, review the terms and click **Сдать**.
A spoken “yes” or an ordinary trade never submits a quest. Worker trophies start
the existing safety-check trip; final payment still requires the worker's verified
return. Completed quests disappear from the active list, remain in the issuer's
history, and produce one thanks and an invitation to ask for another task.

Mira's municipal fund defaults to 300 gold per city session in authored world data.
It is separate from her wallet and cannot be looted or replenished by the model.
All worker rewards, including the ordinary 30 gold, reserve and debit this same
finite city fund. Their promised reward items come from the clerk's actual bag.
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

Diagnostics stay in the server log. Only the reply's ordinary speech reaches the
conversation, preventing a second technical explanation from being spoken ahead
of the character's answer. Speech still checks reach and visibility. Successful
alternatives receive server-authored action receipts in the log, so a claimed
attempt can be compared with its actual outcome.

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

## Character memory and local knowledge retrieval

Each NPC has its own server-owned `conversationId`. It covers everyone that NPC
actually heard, including its own speech and private whispers. A different NPC
never reads this store. NPC-to-NPC communication creates a new attributed hearing
record only when ordinary location, distance and line-of-sight rules permit it;
recording hearing does not enqueue a model reply to every overheard sentence.

People are keyed by server character identity, not nickname. Summaries are retained
for more than 100 interlocutors without the former 32-person eviction. Logout and
resurrection keep the same identity; replacing a permanently dead identity creates
a new mind. All conversation history and quest state remain in server memory and
are lost when the world restarts. There is no database or provider-session resume.

The normal context carries a current-person summary, recent messages, relevant
memories and authoritative contract facts. A model may request deeper recall with
JSON rather than a CLI tool:

```json
{
    "informationRequest": {
        "type": "deep_memory",
        "personId": "known-character-id"
    },
    "decision": null,
    "speech": null,
    "taskAcceptance": "none",
    "companionOrder": null
}
```

There is one lookup and at most two model invocations per input. Both invocations
consume the normal hourly call budget and share the original timeout and
cancellation generation. `informationResults` supplies the summary and relevant
chronological excerpts with source IDs. An unknown identity returns `not_known`
without checking whether some hidden live character exists. Model tools, files,
MCP, shell and external web access remain disabled.

A final reply may contain `personMemoryUpdate` with `personId`,
`throughMessageId`, `sourceMessageIds` and up to 2,000 characters of conversational
summary. Only the current person's own recorded messages can support an update;
watermarks must move forward. Such summaries are fallible recollections of speech,
never proof of quest acceptance, movement, property transfer or payout. The server
contract ledger always takes precedence. Raw archives cap at 64 MiB per NPC;
compacted dialogue is labelled as such and retains a per-person source summary.
Raw foreign whisper transcripts are not added to another client's snapshot. An
NPC may nevertheless choose to recount something it heard according to personality.

Knowledge grants start with world geography and local authored landmarks. Mira
knows city business. Sister Vera has a dialogue-only advisor configuration: her
ordinary cleric controller still handles aid and resurrection. Theology is general;
details of constellation stars come only from the speaking character's currently
unlocked stars. Reading or explaining a passage grants no ability, teaching right,
access to another person's private sky or unseen deity mood.

### Preparing local embeddings

Use Node 24 or newer alongside Bun 1.4.4. Install workspace dependencies normally,
then run once from the repository root:

```sh
bun run knowledge:prepare
```

This downloads the fixed `761b726` revision of
`Xenova/multilingual-e5-small` into ignored `.cache/ratata-models/`. A manifest records
checksums. `GAME_EMBEDDING_MODELS` can select another local model directory, and
`GAME_EMBEDDING_NODE` can select the Node executable. Neither is an inference API
key. The worker checks local hashes and disables all remote model loading during
play. CPU ONNX inference runs in one managed Node subprocess, outside the Bun game
tick, using q8 weights, mean pooling, normalized 384-dimensional vectors and the
model's `query:` / `passage:` prefixes.

Knowledge and owner-memory retrieval combine vector similarity with name/text
matches. Only granted passages are ranked; personal star grants are rechecked
after asynchronous retrieval. The bounded indexing queue defers excess work while
lexical search continues. Missing Node, missing/corrupt model files and worker
failure report a diagnostic and preserve structured and lexical answers. The normal
64 KiB model-context limit remains; optional retrieval excerpts are pruned first.

`bun run build:backend` copies the separate Node worker entry and model settings to
`dist/backend`. Keep installed backend workspace dependencies and the prepared
model directory with the deployment. Model weights are not bundled into JavaScript.
Unit tests inject deterministic embeddings; they never download or load native
models. Run `bun run knowledge:smoke` for real local Russian retrieval, vector dimensions
and normalization checks. It uses the worker JSON-line protocol and reports only
summary metrics, without printing full vectors.

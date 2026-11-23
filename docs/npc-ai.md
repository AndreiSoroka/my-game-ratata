# NPC reasoning through Codex CLI or Claude Code

Mira, Kaplya, Sister Vera and Savva use Codex CLI or Claude Code to choose ordinary
character intentions when a supported CLI is available. The backend owns the event
queue, controller lease, action results and session memory. Model calls run outside
the simulation tick.
Every resulting action still uses `GameCharacter` and the shared authoritative
movement, collision, conversation and life-cycle rules.

Mira, Kaplya and Vera receive a server-owned role and one authored backstory when
the world is created. Their own selected identity is supplied directly on every
model turn, separately from speech style and searchable world articles. See
[NPC identities and backstories](npc-identities.md) for selection seeds, privacy,
identity after death and the optional real-model dialogue check.

## Run locally

Install and authenticate one CLI under the user account that runs the backend.

- **Codex CLI** uses `codex` on `PATH`. Sign in with `codex login`. [Codex CLI setup](https://learn.chatgpt.com/docs/codex/cli).
- **Claude Code** uses `claude` on `PATH`. Sign in with `claude auth login`. [Claude Code setup](https://code.claude.com/docs/en/quickstart).

Start the backend as usual.

```sh
bun run dev:backend
```

NPC AI is enabled by default. With the bundled settings, the backend searches for
`codex` first and uses `claude` if `codex` is absent. Set `GAME_AI_PROVIDER=codex`
or `GAME_AI_PROVIDER=claude` to pick a CLI explicitly. When no usable executable
is available, the backend starts with scripted NPCs. Set `GAME_AI_ENABLED=0` to
always use scripted NPCs. When AI is enabled, the backend logs the provider it
found or reports that no CLI is available.

The CLI signs in through its own authentication flow on the backend machine.
For hosted use of Claude Code, Anthropic requires players to authenticate with
their own eligible credentials. [Anthropic's terms for running Claude Code in a product](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products).

Start the frontend as described in [Playable world](playable-world.md). Speak
normally within 80 world units and line of sight. The current E selection is a
hint, followed by your companion. Otherwise one listener responds, or several may
ask whom you mean. An NPC explicitly agrees before accepting or replacing an
errand. Small talk preserves its route and task budget. AI follow/help/guard/wait/dismiss
requests use chat and existing consent rules. Q toggles selection between yourself
and no target.

Use **Шёпот** within 48 units for a private conversation. **Обменяться** opens a
voluntary two-sided offer and the same private chat. Real unequipped items, stack
quantities and integer gold remain in bags until both participants confirm one
revision. Gifts are allowed. Enter in chat sends text; it never confirms a deal.
Changed offers/resources clear confirmations; death, disconnect or lost reach
cancels without transferring anything. Other players cannot read the offers or
private conversation. Conversations do not steal the receiver's keyboard focus.

The subprocess runs in a disposable directory with model tools and session
persistence disabled. It receives a compact earned observation through stdin and
returns a structured decision. The separate external agent MCP bridge cannot
override an active exclusive NPC controller lease. [External agent MCP bridge](playable-world.md#external-agent-mcp).

## Configuration

Edit [`apps/backend/config/npc-ai.json`](../apps/backend/config/npc-ai.json).
Settings apply after a backend restart. For a built backend, rebuild after changing
the bundled default configuration. To select an external configuration file,
set its path when starting the backend.

```sh
GAME_AI_PROVIDER=codex GAME_AI_CONFIG=/absolute/path/npc-ai.local.json bun run dev:backend
```

`GAME_AI_CONFIG` replaces the default file. Relative paths resolve against the
backend process's current working directory (`apps/backend` when started through
`bun run dev:backend`). A custom file defaults to Codex settings. Set
`GAME_AI_PROVIDER=claude` to apply it to Claude Code. The override is ignored while
AI is disabled.

| Setting                      | Default                                 | Meaning                                                                |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `defaults.cliPath`           | `codex` or `claude`                     | Executable path or name found through `PATH`                           |
| `defaults.model`             | `gpt-6-luna` (Codex), `sonnet` (Claude) | Model used for every invocation                                        |
| `defaults.reasoningEffort`   | `medium`                                | Reasoning effort. Claude Code uses `max` when configured with `ultra`. |
| `defaults.serviceTier`       | `default`                               | Codex speed setting with optional `fast` tier                          |
| `defaults.timeoutMs`         | `60000`                                 | Maximum time for one CLI response                                      |
| `limits.maxCallsPerHour`     | `120`                                   | Shared rolling-hour call limit, including retries                      |
| `limits.maxDecisionsPerTask` | `12`                                    | Maximum model decisions for one task                                   |
| `limits.reviewIntervalMs`    | `60000`                                 | Mira's regular autonomous review interval                              |
| `limits.retryDelayMs`        | `5000`                                  | Delay before the single retry of a failed call                         |

Each `npcs` entry has `actorId`, `role` and optional `settings` overriding the
global model settings. This Codex configuration keeps Mira on the default timeout
and gives Kaplya a shorter one.

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

The CLI account needs access to the configured model. Provider failures receive at
most one retry with the configured model. Repeated failures release the lease and
restore scripted behavior. A room stop aborts pending CLI processes. Death,
identity replacement and cancellation invalidate late replies.

## Current character behavior

- **Savva** searches the Western Ruins for traces of three dead guards. His refuge
  is chosen by the world seed. A local controller continues walking, fighting or
  withdrawing while a model turn is in flight. The model selects an available
  plan from an observer-scoped summary. Savva keeps a session journal, including
  a favorite skeleton and occasional remarks drawn from accepted decisions.
  An accepted combat reply can include a short line in the same call. Encounter
  and low-health remarks also run during movement, casting and pending advice.
- Savva has a separate limit of eight model calls per rolling hour and two per
  fight, with at least 30 seconds between combat calls. Peaceful reviews require
  completed activity and are spaced at least five minutes apart. Player health
  is observed at the usual precision and remains scoped to visible players.
- Savva can order three allied skeletons. Skeletons pursue wild slimes when
  ordered to hunt them. Ash can restore an undead ally, raise a temporary
  skeleton, or transfer the caster's experience to strengthen an ally. A ninth
  level Ash caster can bind a heart in a chest. After the ordinary soul window
  ends, a heart still in place returns the same identity ten minutes from death
  with 70% of each mastery’s XP. These states live in the running world session.
- **Mira** reviews authorized city stock, actual worker requests and worker idle
  reasons. She can inspect residents, walk through the city and offer validated
  quests to connected players. Idle review results are remembered rather than
  holding workers in repeated conversations.
- **Kaplya** converses and accepts peaceful errands. For a merchant errand she
  physically enters the shop, interacts, retains observed offers, returns and
  answers. Errands own movement temporarily; existing following between locations
  remains available after consent.
- Both use the same `GameCharacter` rules. No generated prose creates property,
  progress, damage, consent or rewards. Movement scope is a role capability: companions can travel across the region, while the city coordinator stays in the city.

## Quest proposals and rewards

An NPC may replace its own unaccepted offer on a fresh player request with
`replaceOffer: { offerId, revision }` on `quest_propose` or `worker_quest_propose`.
The server validates the complete replacement before swapping; stale acceptance
cannot take the former offer. Failed replacements preserve it, accepted contracts
are unchanged, and no reward is reserved until the player accepts. Autonomous
city reviews cannot authorize a replacement. `city.requests` lists available
worker requests independently of the single offer currently shown to a player.

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
against a known building, gate or location key; arrival still requires real navigation.
Regional guides select known adjacent lands, walk to a reachable exit, cross through
ordinary travel, and wait for the requester after each crossing. They use observed
positions rather than hidden player coordinates. An expected crossing preserves the
task; arrival, final obstruction and timeout terminate it once. Ordinary `follow`
uses the shared companion controller rather than repeated model waypoints.

Dead NPCs abort queued/in-flight work and stop using AI. Revival never resumes an
old task or delayed result; a fresh player request or a newly eligible proactive
opportunity may start a new turn.
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

## Character memory and model-chosen knowledge retrieval

Each NPC has its own server-owned `conversationId`. It covers everyone that NPC
actually heard, including its own speech and private whispers. A different NPC
never reads this store. NPC-to-NPC communication creates a new attributed hearing
record only when ordinary location, distance and line-of-sight rules permit it;
recording hearing does not enqueue a model reply to every overheard sentence.

People are keyed by server character identity, not nickname. Summaries are retained
for more than 100 interlocutors without the former 32-person eviction. Logout and
resurrection keep the same identity; replacing a permanently dead identity creates
a new mind for that new character. Other NPCs archive the previous identity’s conversations without assigning them to its namesake; see [memory and initiative](npc-memory.md). All conversation history and quest state remain in server memory and
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

There is one shared information lookup (`deep_memory` or `knowledge_search`) and
at most two model invocations per input. Both invocations consume the normal hourly
call budget and share the original timeout and cancellation generation. Neither
lookup can accompany speech, task acceptance or a game action. A second lookup is
rejected. `informationResults` supplies the summary and relevant
chronological excerpts with source IDs. An unknown identity returns `not_known`
without checking whether some hidden live character exists. Model tools, files,
MCP, shell and external web access remain disabled.

The same optional second invocation can instead correct an internally inconsistent
reply, such as movement without explicit task acceptance or a lookup mixed with
speech. `replyCorrection` carries
only an internal reason and the attempted command; the model may willingly accept,
replace, decline or remove the action. It cannot search again during correction.
Lookup and correction never add a third invocation. Invalid drafts are neither
spoken nor remembered, and exhausted correction is terminal rather than queued as
a provider retry. `taskConsent` communicates allowed acceptance values across public
and private channels without revealing another speaker or task.

Recent conversational context contains the last 20 addressed spoken records for the actual interlocutor, excluding movement
observations. Public speech remains public; its server-only addressee attribution does not open a whisper. A peaceful inspection uses ordinary movement and earns fresh, bounded
`scouting` facts after arrival: visible targets, position, location and observation time.
Building interiors remain hidden until the actor enters. Return/report uses the
requester's last earned position; unseen absence is never proof of global absence.
The observations remain in the NPC's own memory if a report cannot be delivered.
Terminal guide timeouts finish the old task; successful guides allow one closing
reply and cannot restart under the same request. Private request statuses identify
the original request to its author.

Each speaking NPC receives a server-only [speech profile](npc-speech-styles.md)
once per world: one to three compatible traits and a tone. `GAME_NPC_SPEECH_SEED`
makes the choice reproducible. It affects phrasing without granting knowledge,
changing consent or modifying game rules; even the liar tells mechanics and action
outcomes truthfully. The same own profile is supplied on initial, lookup and
correction calls.

Manual checks, excluded from automatic suites:

```sh
bun run npc:style:dialogue
bun run npc:scout:dialogue
bun run npc:offers:dialogue --wait-ms=180000
bun run npc:navigation:dialogue
```

The style check applies no decisions. The scout check starts an isolated world,
joins through the ordinary player protocol, walks to Kaplya and asks him to inspect
the tavern and return. All movement and observations use shared validated rules;
it does not teleport characters or alter the running local world.
The offer check waits for two real workers to publish requests before asking Mira
to replace an offer. Autonomous city reviews are silent fixture responses; only
the player dialogue uses the real model. No incidents are forged and no quest is
accepted. If the natural world does not publish two requests before the deadline,
the command exits with status 2 (`not-ready`), rather than claiming a pass.

A final reply may contain `personMemoryUpdate` with `personId`,
`throughMessageId`, `sourceMessageIds` and up to 2,000 characters of conversational
summary. Only the current person's own recorded messages can support an update;
watermarks must move forward. Such summaries are fallible recollections of speech,
never proof of quest acceptance, movement, property transfer or payout. The server
contract ledger always takes precedence. Raw archives cap at 64 MiB per NPC;
compacted dialogue is labelled as such and retains a per-person source summary.
Raw foreign whisper transcripts are not added to another client's snapshot. An
NPC may nevertheless choose to recount something it heard according to personality.

The canonical [world knowledge corpus](../knowledge/README.md) contains short Russian
Markdown articles, grouped by subject. `knowledge/catalog.json` is the single authoring
source for IDs, file paths, audiences, aliases, parent links and development checks.
Markdown contains only a heading and in-world prose. Their bodies explain the world without keys,
menus, commands or developer instructions. General articles explain possibilities;
professional supplements supply exact quantities. For example, every character can
explain chopping with an equipped axe or sword, while a lumberjack additionally knows
the actual yields and tool costs. A speaker must not invent quantities absent from
its supplied knowledge, observations or attributed memories.

The server derives audiences from the actual character: creature type, archetype,
profession, learned abilities/doctrine, explicit settlement membership and stable
personal identity. Visiting or spawning in town, changing appearance, acquiring a
model lease or becoming a Spark does not by itself grant local or expert knowledge.
The outer `audiences` list is OR; an inner list requires every atom (AND). Unknown
audiences, malformed metadata, duplicate IDs and missing parent/source/check links
fail validation. Personal corpus documents never enter another character's search;
an owner may nevertheless recount them through ordinary speech, which creates an
attributed record in the listener's own memory.

The first model call receives no retrieved articles. Its `knowledgeScope` summarizes
only the character's permitted subjects and expertise, without a list of article IDs,
secret titles or technical metadata. The model can answer a greeting or thanks directly,
or request an application-level search:

```json
{
    "informationRequest": {
        "type": "knowledge_search",
        "query": "Какие услуги оказывает кузнец Игнат?"
    },
    "decision": null,
    "speech": null,
    "taskAcceptance": "none",
    "companionOrder": null
}
```

The query must contain 1–300 nonblank characters; actor IDs, paths, audiences and
caller-selected result limits are not accepted. The scheduler binds the search to
the current server-owned character and mind. It searches only permitted articles
and that character's own memory, rechecks grants after asynchronous embedding work,
then supplies the query and results in `knowledge` for the final model call.
The second call cannot ask for more information. This uses the existing NPC JSON
protocol; it does not enable CLI tools or expose an MCP server to the model.
Punctuation is not a router: an implicit request such as «подскажи где кузнец» can
require a search, while «как дела?» may not. Unknown world rules should be looked up
before being stated. Current observations and already supplied conversation facts
can support a direct answer without a lookup.

Search supplies up to six complete articles within 4,000 text characters. Professional
supplements can include their permitted parent article. Aliases improve search but
are omitted from the model context, along with access rules, source paths, test
links and numerical assertions. The corpus is immutable until backend restart and
is packaged only with the backend, never as public client assets. Production reads
one validated `dist/backend/knowledge.json` artifact on startup; development reads
the source catalog and its listed Markdown once. Queries do not reread article files.

Geography, building entrances, normal workshop catalogues and personal discovered
stars remain projections of authoritative definitions. Current prices, stock,
positions, deity mood and contract state require the character's earned observation.
Sister Vera has a dialogue-only advisor configuration; her ordinary cleric controller
still handles aid and resurrection. Theology is general; individual constellation
details come only from the speaker's currently unlocked stars. Reading or explaining
a passage grants no ability, teaching right, ownership, control or private sky access.

Run `bun run knowledge:check` to validate the corpus and compare its `facts` assertions
with actual game definitions and rule functions. Each article links its implementation
and behavioral checks; these authoring references are not model input. Backend unit
tests and builds perform the offline checks without loading native models or calling
an inference API. Update the article and its checks together when a rule changes.

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
matches. Only granted passages are ranked; grants are rechecked
after asynchronous retrieval. The bounded indexing queue defers excess work while
lexical search continues. Missing Node, missing/corrupt model files and worker
failure report a diagnostic and preserve structured and lexical answers. The normal
64 KiB model-context limit remains; optional retrieval excerpts are pruned first.

`bun run build:backend` copies the separate Node worker entry and model settings to
`dist/backend` and compiles the source corpus into `knowledge.json`. Keep installed backend workspace dependencies and the prepared
model directory with the deployment. Model weights are not bundled into JavaScript.
Unit tests inject deterministic embeddings; they never download or load native
models. Run `bun run knowledge:smoke` after editing corpus content for real local
Russian retrieval, vector dimensions, normalization and corpus token-length checks.
It uses the prepared tokenizer to verify every complete article and its aliases
fit the worker's 384-token budget, including the passage prefix and special tokens.
The worker tokenizes explicitly before inference; no pipeline option is relied on
to enforce that limit. Smoke checks report summary metrics without full vectors or
private article bodies. Live model dialogue checks remain manual and separate from
automatic checks. `bun run knowledge:dialogue` exercises the actual model-chosen
lookup path, including a direct thanks reply, an implicit question without `?`,
ordinary and professional tree knowledge, and an observed merchant question. Its
isolated room never applies returned game decisions.

### Persistent article-vector cache

Stable authored articles and reference entries reuse vectors from ignored
`.cache/ratata-knowledge/vectors.json` across backend restarts;
`GAME_EMBEDDING_CACHE` can select a different writable file. Each key hashes the
actual embedding text, including aliases, together with the model profile: model
and revision, prepared-file checksums, tokenization and prefix settings, q8 weights,
pooling, normalization and dimensionality. An access-only metadata change can reuse
the same vector; the server still evaluates the current audiences on every search.

Missing or changed passages are embedded and stored automatically. Writes merge
existing entries under a file lock and replace the snapshot atomically. Invalid
format, mismatched profiles, malformed vectors and unavailable cache storage produce
a diagnostic and leave retrieval usable through recomputation or lexical fallback.
Unit tests use injected providers and temporary cache files, never the real cache.

Player queries, conversation archives and current personal star discoveries are not
stored in this file. A new search query still needs its own embedding. The cache
persists derived computations only; character minds, contracts, possessions and the
world itself remain in process memory.

## Shared initiative and autonomous activities

See [устные приглашения к поручениям](npc-quest-invitations.md) for the two-step
proposal flow, direct player requests, concise greetings and authored grammatical
self-reference. An autonomous invitation does not open the quest modal or accept
a contract on the player's behalf.

All configured AI characters use one coordinator, scheduler, command validator and
`GameCharacter` simulation. Personality, movement scope, speech, consent, combat
and knowledge remain separate data; no activity controller branches on a particular
character ID. The same command check supplies model capabilities and validates
execution. Forbidden drafts can use the shared second invocation for a generated
refusal. No scripted refusal or acceptance is spoken on behalf of an AI character;
when correction/model availability is exhausted, only the private UI status changes.
Scripted controllers retain their authored responses.

With `proactive` enabled (the default), a visible connected human may receive a
model-written greeting on the first conversation or after ten minutes without an
addressed exchange. Delivery, not merely observation, advances the pair’s clock.
Greetings are background work, yield to incoming requests, and do not create tasks
on the player’s behalf.

After five continuous free minutes with a connected human on the same map, an AI
controller may choose a short peaceful activity in its current location. A retained
follow/wait/guard promise, scenario, conversation, exchange or action prevents this.
The server presence condition exposes no unseen player data. Episodes last at most
three model decisions or 120 seconds, and reset the five-minute idle interval when
finished. A new player request or disappearance of the last local player interrupts
only this background episode. Rest is a valid choice; ordinary action validation,
call budgets, timeouts and cancellation still apply.

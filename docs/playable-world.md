# Ash Border: playing and operating the prototype

This document covers controls, windows, visual feedback and local operation. The
[world knowledge corpus](../knowledge/README.md) contains the canonical short
in-world descriptions of implemented mechanics, their audiences and verification
sources. NPC dialogue retrieves those articles without keyboard or interface
instructions. [Character development](character-development.md) covers its windows
and debug atlas; [NPC reasoning](npc-ai.md) describes optional model configuration.

The Lands of Novogorod contain 25 locations. At backend startup Novogorod receives
a new seeded layout; the other 24 maps retain their authored geometry. The pure
`scripts/generate-map.mjs` generator supplies both runtime geometry and the
optional `scripts/generate-world.mjs` file export. Navigation, residents,
resources, interactions and covers use that same map. The server resolves ordinary
character intentions. No external language model or paid API is called by default.
Current world state lives in server memory; restarting the backend begins a new
world session. See [generated city and Bell](generated-city.md) for seed, map
loading, fortifications and shared story rules.

## Play

Choose a name and a starting background. A new identity awakens on the peaceful
cemetery ground beside the chapel; reconnecting preserves the existing identity
and position. For the first activities, see
[gathering and tools](../knowledge/forestry/chopping.md),
[trade](../knowledge/economy/trade.md) and
[Mira's bell quest](../knowledge/quests/bell.md). Backgrounds supply starting
strengths and knowledge; later learning follows the shared character rules.

WASD/arrows move; clicking empty ground walks to a point. **C** toggles sneaking,
**Space** dashes, **I** opens inventory, **P** opens the character window and
**Enter** opens chat. Movement shortcuts use physical key positions, including
with a non-Latin keyboard layout. The minimap shows the current region and its
location danger. Buildings have walkable doors; entering hides their roof.

Ordinary HUD button focus still permits gameplay shortcuts, including I; Enter,
Space and F confirm the focused button. Actual windows and text fields own their
input. Escape performs one operation per press: close the game menu, handle the
current chat/window, cancel a ritual or automated action/target, then open the
menu if nothing remains to cancel. Holding Escape does not advance through these
steps. The visible menu button also works on touch screens.
**Вернуться в игру** resumes input; **Выйти из игры** returns to sign-in without
abandoning the living identity, including during rescue. Signing in with the same
name resumes that identity. The world continues while the menu is open.

The camera can reveal six tiles beyond each map edge, with a black backdrop and
stationary pixel stars; this does not enlarge the playable map. The compact
character panel has an ellipsized nickname, accessible Spark/Echo and speech
icons, and resource bars. Full names remain available in accessible headings and
tooltips. Temporary action notices appear at the top center for five seconds;
repeated snapshots do not extend them. Lasting quest, inventory and party facts
remain in their windows. Gold and item condition are shown in the inventory.

## Finding the game rules

- [World travel](../knowledge/world/travel.md), [movement](../knowledge/world/movement.md) and [danger](../knowledge/world/danger.md).
- [Resources](../knowledge/body/resources.md), [bags](../knowledge/inventory/bag.md), [containers](../knowledge/inventory/containers.md) and [repair](../knowledge/equipment/repair.md).
- [Trees](../knowledge/forestry/chopping.md), [planting](../knowledge/forestry/planting.md), [brushwood](../knowledge/forestry/brushwood.md), [stone](../knowledge/mining/stone.md) and [farming](../knowledge/farming/wheat.md).
- [Crafting](../knowledge/crafting/making.md), [orders](../knowledge/crafting/orders.md), [trade](../knowledge/economy/trade.md) and [worker requests](../knowledge/work/requests.md).
- [Combat](../knowledge/combat/attacks.md), [ranged attacks](../knowledge/combat/ranged.md), [magic](../knowledge/combat/magic.md) and [training](../knowledge/combat/training.md).
- [Learning](../knowledge/development/learning.md), [practice](../knowledge/development/practice.md) and [constellations](../knowledge/development/stars.md).
- [Prayer schools](../knowledge/faith/schools.md), [rescue](../knowledge/life/death-rescue.md), [resurrection](../knowledge/life/resurrection.md), [graves](../knowledge/life/graves.md) and [purification](../knowledge/life/purification.md).
- [Conversation](../knowledge/social/conversation.md), [exchange](../knowledge/social/exchange.md), [companions](../knowledge/social/companions.md), [parties](../knowledge/social/party.md) and [contracts](../knowledge/quests/contracts.md).
- [Theft](../knowledge/law/theft.md), [city justice](../knowledge/law/justice.md) and [absolution](../knowledge/law/absolution.md).

## Inventory, containers and interaction menus

**Q** selects yourself. **E** cycles nearby visible characters and objects from
nearest to farthest; **Shift+E** reverses. **F** performs the selected target's
sole action directly or opens that target's choices. Without a selection, it uses
the nearby interaction in the facing direction. Menus consume gameplay keys and
release held movement. Arrows or W/S select a row, F/Enter/Space activates and
Esc closes the owning window. The key that opens a menu does not activate its
first row; holding confirmation does not repeat it.

Face a chest or barrel and press F to inspect it. The backpack is on the left and
shared contents on the right. Left/right arrows switch sides; up/down or W/S
selects a row; F confirms the transfer. Use **Забрать всё** for the available bulk
transfer. The full bag does not prevent inspection. Escape closes the chest or
standalone inventory even after a background click. Lost reach, travel, death or
disconnect closes an inspection. For a body choose **Обыскать**; its window also
offers **Взять золото** and accepts no deposits.

The inventory shows **Золото**, including zero, and **Прочность** as percentage,
points and a bar for equipped, selected or keyboard-focused equipment. Broken
items are marked as needing repair. Item action and focus shortcuts are described
below with the hotbar.

Nearby signs show their name while faced, or while standing on their footprint.
Press F to read the authored details. Turning or moving away hides the hint.
Wells, troughs and eligible small pond shorelines offer a drinking action; the
selection outlines the actual water interaction area.

## Gathering, planting and farming controls

Equip a suitable tool in the inventory, then click a resource or select it and
press F to start approaching and automatic work. Manual movement, Esc, another
command, equipment changes, damage, stun, death, disconnect or travel stop that
work. It also stops when the tool, energy, space or access is insufficient.
Cancellation never substitutes another source or resumes by itself. A stump has
its own clearing action. Approach a farm bed and press F to sow or harvest.

Assign **Саженец** to any hotbar slot with Shift plus the slot key, then click or
press that slot to select a plot. The binding remains when the bag is empty.
Arrows move the selection, F/Enter or clicking confirms, and Esc cancels. On a
phone the first touch selects; the next touch or hint button confirms. The future
trunk is gray while checking or forbidden and yellow only after the authoritative
preview accepts it. Invalid confirmation keeps selection open with a short
reason. Confirmation starts ordinary walking to the plot. F on a growing sapling
shows growth information and **Срубить без добычи**. Exact outputs and timings
belong to the relevant professional knowledge articles.

## Trading, contracts and rescue windows

Friendly character interactions open their reachable choices. **Покажи товары**
opens a separate shop; the return button or Escape goes back to dialogue. Until
the city Bell is active, purchases, sales, repairs and artisan order placement or
collection are unavailable, including through old windows. Conversation, quests,
Sister Vera, self-crafting and ordinary work remain available. Artisans
have **Купить** and **Заказать**; Ignat also has **Ремонт**. An order confirmation
shows its deposit and remaining payment, and its status shows material shortage,
queue or readiness. See [orders](../knowledge/crafting/orders.md) and
[Ignat](../knowledge/settlements/novogorod/ignat.md) for the underlying rules.

Mira can offer the shared city order while the Bell is silent. One first successful
submission consumes 3 carried slime hearts, pays the single 40-gold budget and
prepares the Bell; competing accepted copies close without consuming their items
or paying again. Then physically approach the Bell **inside the chapel** and use
its activation interaction. Active startup worlds need no hearts and already
contain Kaplya. [The Bell article](../knowledge/quests/bell.md) describes the
in-world explanation.

Before accepting a quest choose **Вся награда сдающему** or **Поровну группе**
(the default). The journal shows active quests, their fixed reward mode and paid
shares; the party window shows presence and contribution. Submission uses the
current quest's confirmation window. Worker requests have **Сообщить о расчистке**
and a later reward claim after the worker's return; the [request article](../knowledge/work/requests.md)
explains the stages.

A selected grave offers inspection, attack and **Упокоить могилу**. Its segmented
ring shows shared purification progress. Bind known prayers separately with
Shift+1–4; resurrection is a mode of the appropriate prayer, without a separate
hotbar action. The preview shows earned information, targets and actual costs.

During rescue, **Начать сначала** voluntarily ends the current identity and opens
character selection after final death is confirmed. It does not transfer the old
identity's inventory, skills or orders to the new one. Read the [rescue](../knowledge/life/death-rescue.md)
and [death](../knowledge/inventory/corpses.md) articles before choosing.

## Law and city actions

Use **C** to sneak, approach a living character and choose **Попытаться украсть**
through F. A witnessed attempt can make **Позвать стражу** available to the victim.
Near a city guard, eligible evidence provides **Пожаловаться на …**. These are
different actions: an urgent call and a formal complaint. Near Sister Vera, choose
**Отпустить грехи** to inspect the available absolution action and its price.
The [theft](../knowledge/law/theft.md), [justice](../knowledge/law/justice.md) and
[absolution](../knowledge/law/absolution.md) articles describe their consequences.

## Movement sounds and keyboard interaction

The game menu has a **Без звука** toggle for music, footsteps and all event/UI sounds. Normal play saves this preference in the browser. `?test=1`, `?mute=1` and builds started with `VITE_GAME_AUDIO_MUTED=1` force silence before the first playback, regardless of saved settings; sound cannot be enabled within those sessions. Muting immediately stops current voices, and unmuting normal play resumes music at its authored volume while retaining the current footstep surface map.

Footsteps come from the hidden authored `Footstep surfaces` Tiled layer. Grass and soil use soft clips, stone uses dry concrete steps and wooden interiors use wood steps, with three variations per material. Slimes retain their own hopping sound. Audible footsteps include other living characters in the current location and fall off quadratically, with a normal walking range of 240 world units. Sneaking is quieter with shorter range; dashing is louder and carries farther. Movement must actually change position; standing against a wall, death, map changes and large snapshot jumps do not produce fake steps. Each playing voice has its own gain and the mixer limits simultaneous steps; hiding the page or stopping the game clears them.

The context action menu follows the focus and activation conventions in [W3C APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and [Menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/). The broader idea of one nearby action key is also present in [Stardew Valley controls](https://stardewvalleywiki.com/Controls); Ratata uses F for the context action.

## Routes, markers and scenarios

Click empty ground to replace the current walking route. **Shift+click** appends
another numbered destination, up to 32. Each marker disappears only after actual
server-confirmed arrival; remaining numbers stay stable. The server first tries
the exact click. If it cannot reach it, it chooses the nearest reachable cell
within two tiles and moves that numbered marker to the accepted destination.
An impossible new point is rejected with a notice and preserves the old route
and numbering. Appending validates the next segment without rebuilding the
current path. If an accepted route becomes blocked, the active marker and HUD
show a server-owned countdown. Ten seconds without progress cancels the entire
remaining route with one notice; stun and action locks freeze that budget.
These temporary routes are separate from the pathfinder's intermediate cells,
saved N markers, scenario destinations and interaction reach rules.

Press physical **N**, or use the HUD marker button, to remember your current place.
The game menu's **Метки** window lists personal markers with their location names
and supports renaming and deletion. These are prototype cartography tools, with no
skill requirement yet. Markers, scenario definitions and current runs live only in
server memory, attached to the current identity. Rejoining and resurrection retain
them; permanent death, abandoning that life or restarting the world removes them.

Open **Сценарии** from the game menu to arrange steps, choose one or several passes
or an endless loop, and set the response to a visible enemy. Steps can walk to a
marker, point or visible target; search for a nearby resource, enemy, chest or item;
gather a quantity or exhaust a source; attack; pick up items; unload a chest; wait;
or recover a resource. Search itself never moves and never sees through walls.
Work steps independently select a suitable visible target. A stone search followed
by woodcutting therefore does not make the stone a tree: woodcutting looks for an
actual visible tree and fails if none is available.

For example, save a marker near a grove and another near a chest, then repeat
**go to grove → gather three wood → go to chest → unload wood**. Unloading defaults
to units actually acquired by this run, even when they joined an older material
stack. The alternative unloads all matching backpack goods; equipped items remain
equipped. All transfers still use real items and validated container access.

Each step has ten seconds of blocked time. Normal path progress, successful work
and ordinary action intervals do not spend that budget. Missing targets, tools,
capacity or a path do. The step is marked failed with its reason when the budget
runs out, then the next step starts; a later loop tries again. Enemy responses
and conversations freeze the remaining budget rather than resetting it. A run
started from a saved definition keeps its own copy of steps and referenced marker
coordinates, so editing the template does not silently change an active job.
Explicit object selections also retain their location: a chest with the same ID
in another location never substitutes for the selected container. A helper's latest
completed or stopped result remains visible to its customer after the helper
returns to its normal routine; a new assignment replaces that report.

Use **Пауза**, **Продолжить** and **Остановить** in the scenario panel or active-run
controls. Manual movement, a replacing click or a manual combat action pauses the
scenario. World Escape pauses it after any owning window has closed. Opening a
window, hiding the page and releasing held movement do not cancel a scenario.
After disconnect, the character remains in the world as a vulnerable Эхо and
continues the run. Rejoining returns control to the same identity. Temporary death
suspends execution; resurrection resumes only after revalidating the current step.

## Искра, Эхо and companions

An Искра means a currently connected human or an accepted model-control lease. Without either, the character is an Эхо and follows authored habits or an assigned scenario. Species, speech and combat capabilities are separate: a speaking scripted slime is an Эхо. Every controller uses the same `GameCharacter` and authoritative rules.

Disconnecting removes the human connection, not the character. The same identity stays visible, vulnerable and able to continue its running scenario as an Эхо; manual held input and private conversation/container sessions close. Rejoining with the same nickname on the same running server restores the same identity and its Искра. Permanent death creates a new identity, and a backend restart resets the in-memory world. Party online status follows the actual connection.

The world-facing rules are described in [companionship](../knowledge/social/companions.md) and [routine work](../knowledge/work/routines.md). Open **Спутники** near city residents. The panel shows their nature, actual control source, speech capability, personality, current agreement and last reply. You make requests within 64 world units; characters may refuse. The princess can travel after an introduction and refuses combat. The veteran can accompany and fight. The guard protects his post and declines travel. Speech does not require movement or combat, and talking does not force someone to follow.

By default, running personalities use local authored rules. The UI reports **Сценарий** and **Эхо** for that controller. It reports **Модель** and **Искра** during an accepted model-control lease. The external agent bridge retains its five-second lease; expiry or an explicit wait returns the actor to its scripted scenario as an Эхо without changing its identity or inventory.

Optional [NPC reasoning through Codex CLI](npc-ai.md) gives Mira autonomous city coordination and Kaplya peaceful conversation and errands. Enable it with `GAME_AI_ENABLED=1`; model, reasoning and limits are configured per NPC. Its exclusive lease renews while a task is active, and completion is based on ordinary action receipts. Earned merchant information, session memory and local diagnostic feedback remain separate from authoritative game rules.

Existing worker, artisan, guard, companion and hostile strategies enter the common scheduler as bounded server-owned policy tasks. Their retained controllers still choose the next ordinary intention; their profession logic is not yet an editable data-only scenario. The two new wanderers and player-assigned jobs use the semantic scenario steps directly. A running or paused assigned scenario, active conversation or exclusive control prevents the baseline policy from acting concurrently.

Прохор and Дарья wander through city street routes using the shared scenario runner. Прохор accepts noncombat work after an introduction; Дарья requires completion of Мира’s hearts-for-the-bell quest. Willingness is authored as typed conditions (`always`, `never`, `met`, `quest_completed`, `all`, `any`), and existing promises, reach, line of sight and availability are checked on assignment. Echo does not mean a player can commandeer it.

A successful conversation stops an NPC and suspends its current scenario step while at least one valid nearby viewer is talking. Closing the last conversation resumes the step. Lost reach or sight, travel, death, disconnect and urgent threats end the corresponding conversation holds. The **Спутники** talk action uses the same dialogue session as F.

## External agent MCP

The optional native stdio MCP server controls eligible NPCs through the same authoritative intentions. It does not edit their coordinates, HP or inventory. Start the backend with a `GAME_AGENT_TOKEN`, then launch the MCP process with the same token:

```sh
GAME_AGENT_URL=http://127.0.0.1:3000 GAME_AGENT_TOKEN=your-local-token-at-least-24-characters bun scripts/agent-mcp.mjs
```

The tools are `ratata_observe` (optional `locationId`) and `ratata_act` (`actorId` and a `decision`: `move`, `move_to`, `movement_mode`, `dash`, `attack`, `open_chest`, `take_chest_item`, `take_all_chest_items`, `take_chest_gold`, `put_chest_item`, `close_chest`, `steal`, `call_guards`, `report_theft`, `absolve`, `speak` or `wait`). The URL must be local and the matching token must contain at least 24 characters. Without a backend token the HTTP agent routes are disabled. Chest commands use the same shared rules; their agent action result includes only that controlled NPC’s validated `chest` view, while the global observation response does not expose container contents. The model control lease lasts 5 seconds, then the scripted controller resumes; `wait` releases it immediately. This bridge does not require or modify global Codex configuration. Browser `window.__ratataTest` remains the independent player-testing interface.

## Hotbar, target focus and combat feedback

The four 48px action slots reset for each new character identity. Slot 1 starts with basic melee attack for every background. Slot 2 starts with Shot for Ranger, Spark for Arcanist or Prayer for Cleric; Vanguard leaves it empty. Slots 3–4 start empty. Use Shift+1–4 to choose basic attack, a known ability, an apple, or clear a slot. One press acts immediately. A second press within 300 ms enables server repetition without an extra immediate cast; another press stops it. Held keys do not repeat. Only one slot repeats at a time, even if the same ability is bound twice. A food double press consumes one apple and never enables repetition. The active slot has an outline and ↻ marker, plus written status showing whether the server is approaching, casting, or waiting for cooldowns or resources. Switching repetition off prevents future applications; an already-started cast follows the normal interruption rules. Each prayer repeats its selected spell, original target and intent, stops after healing or resurrection is complete, and never switches to an unrelated ally or farms practice through plain devotion. Apples bind by item type, consume a real inventory instance and retain their icon at zero quantity. Cooldowns and resource requirements are checked again by the server. A bound prayer shows its exact target, cost and possible allied/self victims before pressing its key; its harmful 48px wave is outlined in the world, with warning markers on visible affected allies and yourself.

Without a selected target, Shot and Spark fire in the facing direction. Their world guides and effects use authoritative hit geometry; basic melee attack is a separate action. See [ranged attacks](../knowledge/combat/ranged.md) and [magic](../knowledge/combat/magic.md) for the rules.

Each assigned slot also has an **×** button labeled **Очистить слот N**, reachable with Tab and activated with Enter or Space. Clearing removes only that slot's binding, keeps every item in the inventory and returns keyboard focus to the now-empty slot.

In the inventory, focus an apple's slot and press Shift+1–4 to bind it directly; Enter is not required. After selecting the apple with Enter or a click, the same shortcuts and numbered assignment buttons also work. The inventory stays open and keeps keyboard focus; assigning a slot does not eat the apple. Close the inventory with Esc, then press the slot's number to eat it.

Use arrows to move between inventory cells and Enter or F to open and confirm item actions. When equipping, consuming or transferring removes the selected item from the bag, keyboard focus returns to the same cell, even if it becomes empty. Continue with the arrows without reopening the inventory. A rejected action keeps its current menu and focus.

Q selects yourself; E cycles nearby visible characters, recoverable bodies and interactive objects from nearest to farthest, and Shift+E reverses the order. The selection radius is the greater of 12 map tiles and the longest learned ability range plus three tiles; targets must also intersect the camera viewport and pass existing concealment rules. The same limit applies to mouse and party-panel selection. Changing the selected target cancels automatic action repetition. F opens the selected reachable target's actions, or uses the facing interaction when there is no selected target. Any friendly reachable character offers **Следовать**. Friendly targets use a circle and shield, hostile targets a diamond and crossed swords; objects retain gold corners. Manual movement, stun, death, window focus loss and Esc cancel automatic control. Follow can continue across adjacent locations using ordinary movement. Menus consume gameplay keys and release held movement.

The party panel puts the crowned leader first, shows names and health with a thin bar without numeric text, and marks distant, offline or fallen members. Incoming invitations offer acceptance/refusal; pending invitations cannot be sent back to their sender.

Arrows and blue-violet sparks use the ability's server windup and selected target. Prayers show distinct Hearth flame, Road wind, Lantern constellation and Grave broken-ring motifs. Healing labels name HP, energy or mana; resurrection has a three-second casting arc and rising completion mark. Only confirmed damage or absorption creates a harmful wave and victim flares. Barriers have facets and crumble when their authoritative state ends. Stun displays **СТАН 0.9** from authoritative remaining time.

Cached Canvas graphics and bounded Excalibur ParticleEmitter bursts share a conservative 32-view scene budget: eight damage reactions, twelve transient spell/status effects, six barriers and six stun labels. Particle reservations never exceed 192. Scene changes and disposal clear effects; reduced motion preserves readable labels and stationary marks while suppressing travel, expansion, shake and particles.

Melee and skeleton strike arcs begin at the same world anchor as the attacker's hit zones, without the torso offset used by spell effects. They point toward the authoritative target, falling back to facing for an untargeted swing. Their initial position and heading stay fixed for that swing; reduced motion keeps the same direction. The curved swing remains ordinary combat feedback. Yellow hit rectangles, directional Shot/Spark corridors and harmful prayer geometry appear only to a living connected observer inside a map-authored training yard, clipped to its interior. Leaving, dying, disconnecting or changing maps clears them.

Novogorod's wooden training pen is placed with the current city layout and connected to the streets; use its observed building landmark rather than fixed coordinates. It retains its three-tile entrance on the west. Its stationary wood-and-straw construct uses shared character combat: select it with a click or E and use ordinary attacks or auto-attacks. Hits measure calculated damage without reducing HP, stunning, granting practice or generating rewards; weapon durability, energy and mana costs still apply. Prayers do not damage wood. Attacks from outside use the same reach and line-of-sight checks, but do not grant the yard's numeric feedback.

Combat feedback uses server-assigned grey «Промах»/«Слабый удар», light yellow «Удар», orange «Добротный удар» and red «Критический удар». Criticals take priority over weakened energy and raw-roll thirds. Exact damage on the dummy is visible from inside its yard; other combat hides amounts. Protocol 0.10.0 retains HP/MP/EN as rounded-down integer percentages without current or maximum amounts unless the observer has the server-only `exactCombatNumbers` capability. This applies to the observer's own character too. Hidden healing, absorption, barrier reserves and recovery notices do not reveal amounts. Private `resourceChecks` tell the acting identity whether an action has enough resources; commands still revalidate their actual costs. Zero-capacity resources are distinguished from empty refillable bars. Private character sheets show approximate bands; Life and Magic stars independently earn precise self-resource knowledge. Raw combat stats and hidden graph state are not sent to other observers. The local character's overhead HP bar stays hidden.

## Speech bubbles and dialogue keys

Each NPC reply appears once in an opaque ivory bubble anchored to the visible speaker. Its tail uses the bubble's measured height, including short replies; edges clamp to the viewport and long text scrolls within a maximum 360px width. Choices and shops stay in their accessible panel without repeating the paragraph. Signs retain their readable text.

From dialogue choices, **PageUp/PageDown** focuses and scrolls the speech text. **Tab/Shift+Tab** cycle between the replies and bubble; **Esc** closes the owning dialogue even after clicking the background. The same opening key does not activate the first reply. The active reply remains until the conversation closes, loses reach or its speaker disappears. Ambient speech expires and never returns from an old receipt. Every new authoritative reply, including repeated equal text, has its own speech receipt; snapshot reads retain that receipt. Personalized NPC replies are visible only to their intended recipient.

## Run locally

```sh
bun install --frozen-lockfile
bun run build
GAME_MAP_ROOT="$PWD/apps/frontend/public/game/map" bun dist/backend/index.js
# Add GAME_WORLD_SEED=novogorod-example to reproduce a city layout.
# in another terminal:
bun run --cwd apps/frontend preview
```

The built client runs at http://localhost:4173 and connects to the backend on port 3000. Alternatively use `bun run dev:backend` and `bun run dev:frontend`. Set
`GAME_WORLD_SEED` on the backend to reproduce a city; otherwise startup chooses a
random seed. Maps are served from `/world/maps/:serverEpoch/:locationId.json`.
The client receives `world_init` before loading the current map; a new epoch
reloads it even at the same location. Static tilesets and images remain under
`/game/map`. If loading fails, use **Повторить загрузку карты**. World state,
contracts, Bell state and characters remain in memory and reset on restart.

## Agent test interface

Open `http://localhost:4173/?test=1`. This opt-in mode works in the production build and exposes a compact panel and `window.__ratataTest`. It has no teleport, damage or inventory bypass. Commands go through the same validated WebSocket protocol as ordinary play.

For autonomous playtesting, use `observe()` to discover targets and candidate commands, `navigate({ targetKey })` to approach them, `travel(direction)` to cross observed exits, and `act` / `waitFor` to inspect outcomes. These methods use the existing player connection. Navigation returns a measured terminal status; `act` receiving a newer snapshot is not a server success acknowledgement. See [AI playtesting interface](agent-playtesting.md) for the API, cancellation rules and a complete quest workflow.

```js
await window.__ratataTest.join('Explorer', 'ranger')
const state = window.__ratataTest.getState()
await window.__ratataTest.moveFor({ x: 1, y: 0 }, 500)
window.__ratataTest.send({ type: 'move_to', target: { x: 680, y: 728 } })
window.__ratataTest.send({ type: 'interact', targetId: 'npc_merchant_1' })
window.__ratataTest.send({
    type: 'gather',
    nodeId: 'a node ID from the snapshot',
})
window.__ratataTest.send({
    type: 'companion_request',
    targetId: 'npc_princess_1',
    request: 'talk',
})
window.__ratataTest.send({
    type: 'learn_skill',
    skillId: 'fireball',
    targetId: 'npc_scholar_1',
})
window.__ratataTest.send({ type: 'pray' })
window.__ratataTest.inventory(true)
window.__ratataTest.stop()
```

`getState()` returns a detached snapshot including current location, player, resources, quest, notices and final-death status. The interface is absent without `?test=1`. Timing, ownership, proximity, inventory capacity, costs, kills and lifecycle remain server-authoritative.

## Verification

Backend tests cover combat reach, map connectivity, crossings, isolated locations, quest credit, reward duplication, gathering/crafting, progression, resurrection/permadeath, atomic theft, private outcomes and bounded crime reactions. Frontend tests cover controls, theft interactions, hit presentation and movement cleanup.

`bun run check` is the automatic pre-commit gate: formatting, types, lint, unit/script tests and builds. When gameplay or UI behavior changes, run the affected browser E2E scenarios manually, for example `bun run test:e2e -- e2e/social-exchange.spec.ts`. Documentation and formatting changes do not require browser runs.

`bun run test:e2e` runs the full standard headless Chromium suite. `bun run check:full` combines the automatic checks with that full suite for an explicitly requested full verification. App browser runs start a fresh test world on backend/frontend ports 3500/5500. Plain `playwright test` also defaults to Chromium; other browser projects require an explicit selection.

Additional suites run manually from the repository root:

- `bun run test:e2e:firefox` — standard game scenarios in Firefox.
- `bun run test:e2e:webkit` — standard game scenarios in WebKit.
- `bun run test:e2e:graves` — desktop and mobile grave lifecycle scenarios, each in a separate fresh world.
- `bun run test:e2e:storybook` — Storybook visual checks.
- `bun run test:e2e:all` — all three browsers, grave lifecycle scenarios and Storybook checks.

App and grave suites do not reuse existing servers. `E2E_BACKEND_PORT` and `E2E_FRONTEND_PORT` change the app pair; grave scenarios use the next ports, 3501/5501 by default. Grave artifacts and reports are retained separately as `graves-desktop` and `graves-mobile`, so disconnected actors, earlier deaths and encounter age from one viewport cannot alter the other. Run either grave viewport alone with `bun run --cwd apps/frontend test:e2e:graves:desktop` or `test:e2e:graves:mobile`. All gameplay actions use ordinary validated commands; long ritual scenarios wait for the real server deadline.

## References

- Wildermyth: persistent consequences of choices — https://wildermyth.com/guide/
- Caves of Qud: faction reputation — https://wiki.cavesofqud.com/wiki/Reputation
- AI Dungeon: reusable world/character context — https://help.aidungeon.com/faq/story-cards

## FOnline references and future direction

Reviewed on 2026-11-06. The newer official FOnline2 wiki describes action-based skill growth and a 20% training advantage for tagged skills: weapon skills grow through NPC kills, Medicine through treatment, Repair through repair/restoration/crafting, and Barter through NPC trade. This is useful inspiration for distinct practical professions; this game's sword practice remains tied to damaging hits. Character creation combines origins, attributes, perks and traits. Some FOnline traits forbid equipment; those restrictions are not part of our intended classless builds. Sources: [current Skills](https://wiki.fonline2.com/index.php/Skills), [creation and origins](https://wiki.fonline2.com/index.php/Races#Character_Creation), [Perks](https://wiki.fonline2.com/index.php/Perks), [Traits](https://wiki.fonline2.com/index.php/Traits).

Versions matter. The legacy FOnline2 skills page explicitly describes its 2013-era list, level-awarded skill points, books, usage-based Barter/Scavenging, and theft from players with cooldowns and town restrictions. The newer Skills list does not establish current player-theft rules. FOnline: Reloaded is a separate game whose Steal page explicitly excludes players and their followers. Treat these as separate references, not one current ruleset. Sources: [legacy FOnline2 Skills, including Steal](https://fonline2.com/wiki/Category_Skills.html#Steal), [Reloaded Steal](https://fonline-reloaded.net/wiki/Steal).

Design direction, rather than implemented features:

- Backgrounds and aptitudes can change starting strengths or practice rates; every character build must retain a path into every learnable branch. Social and noncombat careers should have useful actions of their own: negotiation, trade, repair, exploration and perception.
- Theft now uses the shared implementation described above. Future city laws can add independent witnesses, fines, restitution and local reputation; the current rules implement temporary defense, formal blacklisting and paid absolution.
- Future cities can use the separate warehouse and consumption model now implemented for Novogorod, producing reasons to travel, trade, escort caravans and take personal contracts. Markets and routes belong to world data. The 25 existing locations form a test region; additional cities and intercity transport are not implemented.

Terrain borders use connected atlas quadrants, including diagonal concave corners at road junctions and pond shores. Final generation removes isolated pond fragments smaller than a coherent 3×3 area before creating water interactions and collision metadata.

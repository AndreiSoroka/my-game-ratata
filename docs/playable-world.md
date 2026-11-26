# Ash Border: playing and operating the prototype

This document covers controls, windows, visual feedback and local operation. The
[world knowledge corpus](../knowledge/README.md) contains the canonical short
in-world descriptions of implemented mechanics, their audiences and verification
sources. NPC dialogue retrieves those articles without keyboard or interface
instructions. [Character development](character-development.md) covers its windows
and debug atlas; [NPC reasoning](npc-ai.md) describes optional model configuration.

The Lands of Novogorod contain 25 surface locations. At backend startup the seed
sets the layout of Novogorod, the Ash refuge in Western Ruins and the sites of
two to four dungeon towers across the region. The pure
`scripts/generate-map.mjs` generator supplies both runtime geometry and the
optional `scripts/generate-world.mjs` file export. Navigation, residents,
resources, interactions and covers use that same map. The server resolves ordinary
character intentions. Eligible NPCs can use a model through an authenticated CLI on
the backend machine. [NPC AI setup](npc-ai.md).
Current world state lives in server memory; restarting the backend begins a new
world session. See [generated city and Bell](generated-city.md) for seed, map
loading, fortifications and shared story rules.

The world and Excalibur Storybook previews render with WebGL2 and pixel-art
filtering. The browser must support WebGL2. Canvas 2D is used to draw source
textures for terrain and effects. If the browser loses its graphics context,
the game rebuilds the renderer while keeping the character connected. If that
attempt fails, «Восстановить графику» starts another attempt.

## Play

Choose a name and a starting background. A new identity awakens on the peaceful
cemetery ground beside the chapel; reconnecting preserves the existing identity
and position. For the first activities, see
[gathering and tools](../knowledge/forestry/chopping.md),
[trade](../knowledge/economy/trade.md) and
[Mira's bell quest](../knowledge/quests/bell.md). Backgrounds supply starting
strengths and knowledge; later learning follows the shared character rules.

The login form starts with a local fantasy name. «Сгенерировать другое имя» replaces it without
submitting; you can also edit «Имя героя» and press «Войти». Half the proposals are short names and
half include a gender-neutral byname. Full names fit the 24-character limit without truncation.
The page language selects a separate Russian or English pool; the page currently uses Russian.
Name selection sends no requests. Its [source and BSD notice](../apps/frontend/src/game/names/README.md)
are included with the frontend build.

A generated proposal sends `join.createOnly: true`: the server rejects an existing normalized name,
including a disconnected character. An error or cancelled connection keeps the proposal and that
flag. Manual edits and a confirmed server join clear it; leaving and rejoining under an accepted
name from the same browser restores the same identity using its saved credential.
Refreshing an active tab resumes that character automatically. Using the game's
exit button returns to the form and clears automatic entry for that tab.
The form and input request [`autocomplete="off"`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete).

WASD/arrows move; clicking empty ground walks to a point. **C** toggles sneaking,
**Space** dashes, **I** opens inventory, **P** opens the character window and
**Enter** opens chat. Movement shortcuts use physical key positions, including
with a non-Latin keyboard layout. The minimap shows the current region and its
location danger. Buildings have walkable doors; entering hides their roof.

Ordinary HUD button focus still permits gameplay shortcuts, including I; Enter,
Space and F confirm the focused button. Actual windows and text fields own their
input. In windows and the inventory, WASD navigates the interface. W and S scroll
focused chat history. Escape performs one operation per press: close the game
menu, handle the current chat/window, cancel a ritual or automated action/target, then open the
menu if nothing remains to cancel. Holding Escape does not advance through these
steps. The menu button beside Inventory also works on touch screens.
**Вернуться в игру** resumes input; **Выйти из игры** returns to sign-in without
abandoning the living identity, including during rescue. The world continues
while the menu is open.

When the last connection leaves, the character stays in the world as a
vulnerable Echo. It walks within three tiles of the departure point for one
minute of game time, then heads to the Three Roads inn in Novogorod. Seeing a
hostile character sends it to the inn early. An active scenario keeps control
until it finishes, when the walk starts at the scenario's final position.
Signing in with the same name resumes control of the same character at its
current position.

The camera can reveal six tiles beyond each map edge. Five layers of pixel stars
drift at different speeds across the black margin as the camera moves. The compact
character panel has an ellipsized nickname, accessible Spark/Echo and speech
icons, and resource bars. Full names remain available in accessible headings and
tooltips. Temporary action notices appear at the top center for five seconds;
repeated snapshots do not extend them. Lasting quest, inventory and party facts
remain in their windows. Gold and item condition are shown in the inventory.

## Dungeons

Walk through a stone tower's open doorway to reach the first floor. The stone
arch leads back to that tower. Walk onto the stone stairs to move between floors.
Each dungeon has one to five floors, with a separate room count and layout on
each floor. Each world seed places at least one small crypt and one large dungeon,
with up to two medium dungeons. Rooms range from 3×3 to 30×30 tiles and connect
via corridors.

Some floors hide extra rooms behind ordinary-looking masonry. Listen for a
quiet draft as you walk nearby or stand right against the wall. Melee strikes,
arrows and damaging spells can open a passage. A secret room may hide another
wall. Two skeletons guard a shared chest in the last room. Opened passages,
remaining loot and permanent defeats persist for the world session, including
when you leave a floor or refresh the browser.

Fat zombies can appear in spacious rooms from the second floor onward.
They have ten times a dungeon skeleton's health and their slow melee hit
pushes surviving targets away. Each starts with part of the Heavy Flesh
constellation unlocked. A killing blow against a living enemy opens one more
star. Fat zombies leave a Zombie heart in their bodies, and hostile skeletons
leave a Bone. Loot the trophy within a minute to keep that enemy down for the
world session. Otherwise, it rises where it fell with half its maximum health.

General merchants in Novogorod sell torches for 3
gold and lanterns for 10. Equip one in the inventory's Light slot. Torches
illuminate four tiles and lanterns six. Wall torches light pockets of the dungeon,
and the exit arch and floor immediately underfoot are faintly visible in the dark.
Darkness affects the rendered scene. Server reach and line of sight use the
usual rules.

The City Portal spell opens a two-way portal between the dungeon and Novogorod.
A pursuing monster that sees you cross can use the same portal while it lasts.

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

**Q** toggles self-selection. **Tab** cycles nearby visible non-hostile
characters, recoverable bodies and objects. **E** cycles hostile characters.
Both cycle from nearest to farthest. **Shift+Tab** and **Shift+E** reverse the
respective order. **F** performs the selected target's
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
current quest's confirmation window. Worker requests have **Передать трофей и доложить**
and a later reward claim after the worker's return; the [request article](../knowledge/work/requests.md)
explains the stages.

A selected grave offers inspection. Attack and use **Упокоить могилу** from the
action bar. Its segmented ring shows shared purification progress. Bind known prayers with
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

**NPC voice** starts enabled and remembers your choice. Master mute and silent sessions also mute NPC speech.

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

Press physical **N** to remember your current place. The game menu's **Метки** window
also offers **Поставить здесь** and lists personal markers with their location names.
It supports renaming and deletion. These are prototype cartography tools, with no
skill requirement yet. Markers, scenario definitions and current runs live only in
server memory, attached to the current identity. Rejoining and resurrection retain
them; permanent death, abandoning that life or restarting the world removes them.

Open **Сценарии** from the game menu. In **Готовые**, choose a template and create
a personal copy. Fill in your own markers and settings, then save and start it
from **Мои**. The builder and pseudocode edit the same definition. Before saving,
the game validates actions, targets, selected steps and sequences, and owned
markers. This release replaces the previous scenario format. Old scenarios and
runs do not carry over.

A scenario has a main route and optional reactions that start named action
sequences. Choose one pass, a fixed number, or a continuous repeat. Each pass starts
at least five server gameplay seconds after the preceding start. When the main route
ends early, reactions remain armed until the end of that window. If a reaction
matches, the first one in display order wins and skips the remaining route steps.
Only one reaction can run per pass, and the next pass starts with a fresh route.
A reaction can optionally post a private notification.

For example, create a marker at a grove and another at a chest, then copy
**Лесоруб**. The route goes to the grove, gathers wood, and unloads the batch.
Unloading the acquired batch includes items that merged into an older stack.
Its full-bag reaction can unload all matching items in the backpack. Equipment
stays equipped. You can also react to a visible enemy, a nearby friendly character,
a selected ripe plot, or the result of a specific main-route step. The **Следовать
за дружественным персонажем** template uses the normal Follow command when the
executor sees a nearby friend and is not already following anyone.

```text
repeat forever
main {
}
sequence "Следовать" {
  follow reaction_target
}
on friendly_nearby(5 tiles) while not_following -> "Следовать"
```

Movement can optionally use a normal dash along an available route segment.
An ability step selects a learned ability and a supported target. The server checks
perception, reach, costs, cooldowns and consent at execution. Movement and work
report blocked paths and unavailable targets. The run keeps its own saved steps
and marker coordinates, so changing the copy in your library does not change
the active run. Explicit object selections retain their location. A helper's
latest completed or stopped result remains available to its customer after the
helper returns to its normal routine.

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

Press **Enter** to speak in **Рядом**. A selected character takes priority. With no selection, a name at the start addresses all nearby characters with that name. An unaddressed remark can reach every nearby character. A speaking NPC with an available model may take a turn and answer or stay silent. Select a nearby resident and press **F** for **Шёпот** and their available services. Mira's **Городские дела** opens the city quest and report, and **Обращения работников** shows the clerk's published requests. [Companionship](../knowledge/social/companions.md) and [routine work](../knowledge/work/routines.md).

Use **F** on a nearby guild representative to take an offered contract and choose who shares its reward. View active contracts in **P → Квесты**. Use **F** on a nearby player to invite them or answer their invitation, and use **Покинуть отряд** in the party panel to leave.

NPCs without an active model-control lease use local authored rules. The UI reports **Сценарий** and **Эхо** for that controller. It reports **Модель** and **Искра** during an accepted model-control lease. The external agent bridge retains its five-second lease. Expiry or an explicit wait returns the actor to its scripted scenario as an Эхо with the same identity and inventory.

The server checks Codex CLI or Claude Code before the world starts. Mira, the necromancer Savva, Kaplya, Leia and Bran use the model to choose activities. Passive NPCs use it in addressed conversations. An exclusive lease renews while a task is active, and the server determines completion from ordinary action receipts. [NPC reasoning, readiness and world modes](npc-ai.md).

Routine gathering and farming use the same scenario movement and work actions as assigned jobs. Danila brings batches of wood and any collected brushwood to the merchant for the city warehouse. At 20 logs he takes a break at the plaza, by the shop or near the guild. He returns to work as soon as stock drops below 20.

When danger blocks work, Danila, Gordey or Agafya reports to Mira. After the quest holder requests turn-in, the worker returns to the original worksite, checks safety with a real profession action and reports back before the reward is available. Guard, artisan, companion and hostile strategies retain their server-owned policies.

Прохор and Дарья wander through city street routes using the shared scenario runner. Players can ask Kaplya, Leia and Bran for companionship. The server checks explicit consent, existing promises, reach, line of sight and availability before assigning work.

A successful conversation stops an NPC and suspends its current scenario step while at least one valid nearby viewer is talking. Closing the last conversation resumes the step. Lost reach or sight, travel, death, disconnect and urgent threats end the corresponding conversation holds.

## External agent MCP

The optional native stdio MCP server controls eligible NPCs through the same authoritative intentions. It does not edit their coordinates, HP or inventory. Start the backend with a `GAME_AGENT_TOKEN`, then launch the MCP process with the same token:

```sh
GAME_AGENT_URL=http://127.0.0.1:3000 GAME_AGENT_TOKEN=your-local-token-at-least-24-characters bun scripts/agent-mcp.mjs
```

The tools are `ratata_observe` (optional `locationId`) and `ratata_act` (`actorId` and a `decision`: `move`, `move_to`, `movement_mode`, `dash`, `attack`, `open_chest`, `take_chest_item`, `take_all_chest_items`, `take_chest_gold`, `put_chest_item`, `close_chest`, `steal`, `call_guards`, `report_theft`, `absolve`, `speak` or `wait`). The URL must be local and the matching token must contain at least 24 characters. Without a backend token the HTTP agent routes are disabled. Chest commands use the same shared rules; their agent action result includes only that controlled NPC’s validated `chest` view, while the global observation response does not expose container contents. The model control lease lasts 5 seconds, then the scripted controller resumes; `wait` releases it immediately. This bridge does not require or modify global Codex configuration. Browser `window.__ratataTest` remains the independent player-testing interface.

## Hotbar, target focus and combat feedback

The four 48px action slots reset for each new character identity. Slot 1 starts with basic melee attack. Ranger starts with Quick Shot and Sniper Shot in slots 2 and 3, Arcanist with Spark and Barrier, and Cleric with Prayer in slot 2. Vanguard starts with slot 1 only. The panel tries to place each newly known active ability in the first free slot once per character. If all slots are full, the ability stays available for manual assignment. Clearing a slot keeps it empty until a new ability fills it or you assign something manually. Reloading the same tab keeps that character's assignments in the current world.

Use Shift+1–4 to choose basic attack, a known ability, an apple, or clear a slot. A second press on the same slot within 300 ms enables server repetition without an extra immediate cast; another press stops it. Held keys do not repeat. Only one slot repeats at a time, even if the same ability is bound twice. A food double press consumes one apple and never enables repetition. The active slot has an outline and ↻ marker, plus written status showing whether the server is approaching, casting, or waiting for cooldowns or resources. Switching repetition off prevents future applications; an already-started cast follows the normal interruption rules. Each prayer repeats its selected spell, original target and intent, stops after healing or resurrection is complete, and never switches to an unrelated ally or farms practice through plain devotion. Apples bind by item type, consume a real inventory instance and retain their icon at zero quantity. Cooldowns and resource requirements are checked again by the server. A bound prayer shows its exact target, cost and possible allied/self victims before pressing its key; its harmful 48px wave is outlined in the world, with warning markers on visible affected allies and yourself.

One press of basic melee approaches the selected enemy or training dummy and swings once when in range and ready. With no selection it highlights the nearest living enemy or dummy in the normal selection area, on screen and in line of sight. If none qualifies, the slot swings in place. A second press within 300 ms repeats the attack against that same target, approaching again when it moves out of reach. Target loss, selection changes, manual movement or Esc cancel the approach or repetition. An already-started swing resolves under the usual combat rules.

An empty human weapon slot uses the permanent backup knife; the hotbar calls it
«Удар ножом». Equipping a sword or axe changes that label. A broken equipped
weapon blocks the attack until removed or repaired. All backgrounds share the
same ordinary attack rules. Learned Blade techniques can be assigned like other
abilities. «Глухая оборона» toggles once per press and highlights its slot without
an automatic-repeat marker; leaving it remains possible during its reentry
cooldown. The status explains its movement and casting restrictions. Earned combo
stacks are shown only to their owner. Attack animation phases and training guides
consume server timing and geometry; client animation does not decide a hit.

Without a selected target, Quick Shot and Spark fire in the facing direction. Quick Shot spends 10 energy and pauses movement for 200 ms of aim. The Moving Shot skill at Arrow mastery level 4 lets the archer keep walking at ordinary speed while aiming and releasing. Economical Shot reduces the cost to 8 energy. Hold Target gives the next Quick Shot against the same target 10% more damage if it lands within three seconds of a useful Quick Shot hit. Sniper Shot requires a visible target. A walking command interrupts its aim and keeps the spent energy and cooldown. The server supplies the hit geometry and release timing used by the world guides and effects. [Ranged attacks](../knowledge/combat/ranged.md) · [Magic](../knowledge/combat/magic.md)

Click **×** to clear an assigned slot, or press Shift+1–4 and choose **Очистить слот** in the assignment dialog. Clearing removes the binding, keeps all items in the inventory and returns keyboard focus to the game world.

The hotbar uses the same dark frame as the player HUD. Active slots use a light face with a dark icon, cooldowns are shown in seconds, and bound consumables show their count on the bottom edge, including zero. Inventory and the game menu sit below the hotbar. On narrow screens, the adventure shortcuts get their own row as well.

In the inventory, focus an apple's slot and press Shift+1–4 to bind it directly; Enter is not required. After selecting the apple with Enter or a click, the same shortcuts and numbered assignment buttons also work. The inventory stays open and keeps keyboard focus; assigning a slot does not eat the apple. Close the inventory with Esc, then press the slot's number to eat it.

Use arrows to move between inventory cells and Enter or F to open and confirm item actions. When equipping, consuming or transferring removes the selected item from the bag, keyboard focus returns to the same cell, even if it becomes empty. Continue with the arrows without reopening the inventory. A rejected action keeps its current menu and focus.

Tab cycles non-hostile targets, including training dummies and interactive objects. E cycles hostile characters. The selection radius is the greater of 12 map tiles and the longest learned ability range plus three tiles. Targets must also intersect the camera viewport and pass existing concealment rules. The same limit applies to mouse and party-panel selection. Changing the selected target cancels automatic action repetition. F opens the selected reachable target's actions, or uses the facing interaction when there is no selected target. Any friendly reachable character offers **Следовать**. Friendly targets use a circle and shield, hostile targets a diamond and crossed swords; objects retain gold corners. Manual movement, stun, death, window focus loss and Esc cancel automatic control. Follow can continue across adjacent locations using ordinary movement. Menus consume gameplay keys and release held movement.

The party panel puts the crowned leader first, shows names and health with a thin bar without numeric text, and marks distant, offline or fallen members. Incoming invitations offer acceptance/refusal; pending invitations cannot be sent back to their sender.

Arrows and blue-violet sparks use the ability's server windup and selected target. Prayers show distinct Hearth flame, Road wind, Lantern constellation and Grave broken-ring motifs. Healing labels name HP, energy or mana; resurrection has a three-second casting arc and rising completion mark. Only confirmed damage or absorption creates a harmful wave and victim flares. Barriers have facets and crumble when their authoritative state ends. Stun displays **СТАН 0.9** from authoritative remaining time.

Cached Canvas graphics and bounded Excalibur ParticleEmitter bursts share a conservative 32-view scene budget: eight damage reactions, twelve transient spell/status effects, six barriers and six stun labels. Particle reservations never exceed 192. Scene changes and disposal clear effects; reduced motion preserves readable labels and stationary marks while suppressing travel, expansion, shake and particles.

Melee and skeleton strike arcs begin at the same world anchor as the attacker's hit zones, without the torso offset used by spell effects. They point toward the authoritative target, falling back to facing for an untargeted swing. Their initial position and heading stay fixed for that swing; reduced motion keeps the same direction. The curved swing remains ordinary combat feedback. Yellow hit rectangles, directional Shot/Spark corridors and harmful prayer geometry appear only to a living connected observer inside a map-authored training yard, clipped to its interior. Leaving, dying, disconnecting or changing maps clears them.

Novogorod's wooden training pen is placed with the current city layout and connected to the streets; use its observed building landmark rather than fixed coordinates. It retains its three-tile entrance on the west. Its stationary wood-and-straw construct uses shared character combat: select it with a click or E and use ordinary attacks or auto-attacks. Hits measure calculated damage without reducing HP, stunning, granting practice or generating rewards; weapon durability, energy and mana costs still apply. Prayers do not damage wood. Attacks from outside use the same reach and line-of-sight checks, but do not grant the yard's numeric feedback.

Combat feedback uses server-assigned grey «Промах»/«Слабый удар», light yellow «Удар», orange «Добротный удар» and red «Критический удар». Criticals take priority over weakened energy and raw-roll thirds. Exact damage on the dummy is visible from inside its yard; other combat hides amounts. Protocol 0.12.0 retains HP/MP/EN as rounded-down integer percentages without current or maximum amounts unless the observer has the server-only `exactCombatNumbers` capability. This applies to the observer's own character too. Hidden healing, absorption, barrier reserves and recovery notices do not reveal amounts. Private `resourceChecks` tell the acting identity whether an action has enough resources; commands still revalidate their actual costs. Zero-capacity resources are distinguished from empty refillable bars. Private character sheets show approximate bands; Life and Magic stars independently earn precise self-resource knowledge. Raw combat stats and hidden graph state are not sent to other observers. The local character's overhead HP bar stays hidden.

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

The pre-commit hook uses `lint-staged` to check formatting and lint only staged files. Run `bun run check` separately for repository-wide formatting, types, lint, unit/script tests and builds. When gameplay or UI behavior changes, run the affected browser E2E scenarios manually, for example `bun run test:e2e -- e2e/social-exchange.spec.ts`. Documentation and formatting changes do not require browser runs.

`bun run test:e2e` runs the full standard headless Chromium suite. `bun run check:full` combines `bun run check` with that suite for an explicitly requested full verification. App browser runs start a fresh test world on backend/frontend ports 3500/5500. Plain `playwright test` also defaults to Chromium; other browser projects require an explicit selection.

Additional suites run manually from the repository root:

- `bun run test:e2e:firefox` — standard game scenarios in Firefox.
- `bun run test:e2e:webkit` — standard game scenarios in WebKit.
- `bun run test:e2e:graves` — desktop and mobile grave lifecycle scenarios, each in a separate fresh world.
- `bun run test:e2e:storybook` — Storybook visual checks.
- `bun run test:e2e:engine` — a fresh Vite harness on port 5600 for real Excalibur rendering, loading and audio.
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

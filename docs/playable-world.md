# Ash Border: playable world

The first scenario is authored AI-generated content: 25 deterministic maps in the Lands of Novogorod and a stateful quest. No external language model or paid API is called at runtime. The generation boundary is separate from simulation: `scripts/generate-world.mjs` builds Tiled maps, `adventureContent.ts` defines the initial story, and authoritative server events update the story state. A future model can generate validated content once and issue the same client commands used by the player and test interface.

## Play

Choose a name and one of four starting backgrounds. A background provides initial advantages; it does not lock future skills. Start without gold or equipment. Gather nearby herbs, fiber, wood and scrap; craft food, boots or a sword. Enter the guild building and talk to Mira in Novogorod to accept the bell quest. Hostile scripted slimes leave one real slime-heart item inside a shared corpse when defeated, even before the quest is accepted. Search corpses and take three hearts into your backpack and bring them to Mira; delivery consumes those three item instances and pays the reward once. Hearts stored in a chest or dropped on the ground do not count until carried again. Kill statistics are separate from the delivery objective. Restore the bell after the delivery. Savva sells supplies in his shop south of the square. Resource deposits are shared and exhaustible.

Vanguard fights in melee with 150 energy and a 20% damage advantage; Ranger starts with the ranged Shot; Arcanist starts with Spark and Barrier; Cleric starts with Prayer and resurrection knowledge. Cleric basic attacks are short melee strikes, not invisible ranged magic. Skeletons share the same model and use a paid Bone Strike that can stun for 0.8 seconds. Everyone can learn swordsmanship, miracles and fire magic. All use `GameCharacter`, common combat, movement, resources, cooldowns and progression. Their configuration and controller are the differences.

WASD/arrows move, click empty ground walks to a point, C toggles sneaking, Space dashes, I opens inventory and Enter opens chat. T cycles visible enemies; Shift+T cycles allies, including fallen allies still eligible for rescue; F selects yourself. Clicking a hostile character selects that exact target, while clicking a friendly character opens its reachable actions. Q toggles approaching and automatically attacking the selected enemy; without a selected enemy it requests one ordinary attack. Escape clears focus and cancels automated control. Manual movement, text/menu focus, blur, hidden pages, death and stun release held control. A lost target never silently substitutes its neighbor.

A fallen hero has 60 seconds to be resurrected. A living cleric or a character with miracles level 5 within 48 world units channels for 3 seconds and spends 20 mana. Death, distance, location, stun and deadline are checked again at completion. Sister Vera lives in the chapel; a rescuer must still reach the fallen character before the deadline. Resurrection retains identity and belongings. At expiry all carried items, equipment and gold transfer into a shared corpse before the hero is removed. Skill knowledge and personal quest state end with that identity; starting again creates a new server identity even with the same nickname. Ordinary NPCs leave a corpse immediately and retain their shared-model respawn policy, without restoring the possessions they dropped.

## Corpses and carried loot

A mortal hero's backpack, equipped items and gold remain protected throughout the
60-second resurrection window. Successful revival keeps them on the same character.
Only final death moves them into the corpse, before retirement clears the old identity.
Nonmortal NPCs transfer possessions immediately on death; respawning restores their
health and resources but never recreates the bag, equipment or gold they lost.

Approach a body, face it and press **E** to choose **Обыскать**. The shared container
window shows the body's name, its remaining items and a separate gold action.
Use arrows or W/S to select and **E/Enter** to take an item or **Взять золото**;
**Забрать всё** transfers all items that fit and all available gold. Gold does not
occupy backpack slots, so it can still be taken with a full bag. Overflow remains in
the body. **Esc** closes the inspection. Depositing into a corpse is unavailable.

Transfers move existing item instances atomically: two viewers cannot claim the
same item or gold twice. Contents are sent only to validated nearby viewers; each
transfer rechecks reach, line of sight, location, life and readiness. Lost reach,
travel, death or disconnect closes the viewing session. Bodies remain independently
of the character's disappearance or respawn until empty or the world session ends.
They have stable identities derived from the character and genuine death sequence.

Idle hostile creatures can walk to visible loose items or corpses and use the same
pickup/container rules. Combat and investigating threats take priority. Carried loot
is finite and transfers again when that creature dies; NPC equipment is never restored
by respawn. A skeleton drops its actual equipped sword, without an extra random sword.
Hostile nonhuman-controlled slimes supply one biological heart per genuine death,
inside their corpse; this renewable trophy is independent of quest acceptance.

All inventory, gold, corpse receipts and containers currently live in server memory.
Restarting the server begins a new world session; durable persistence is not implemented.

## Knowledge through use

Open **Знания** to see each skill at levels 1–10, its practice counter and unlock requirements. Swordsmanship grows from successful weapon hits. Prayer for a miracle costs 5 mana and has a 3-second cooldown. When no eligible target is available, it becomes a free plain prayer with the same cooldown: the caster animates with their patron's emblem, without healing, damage, resurrection or skill practice. The hotbar shows **Помолиться · 0 MP · Без эффекта**. A meaningful prayer attempt advances faith, including refusals; a successful meaningful gift advances miracles. At miracles level 5 any background can attempt resurrection while following Hearth.

Use **Изучить огненный шар** near the scholar in camp, within 64 world units. Fireball is initially unlearned for every background, including Arcanist. Select a nearby hostile character in the knowledge window and cast: Fireball costs 12 mana, has range 160 and a 1-second cooldown. Greater Fireball unlocks automatically at Fireball level 10; it costs 24 mana, has range 192 and a 2-second cooldown. The server checks resources, range, line of sight and cooldowns. Successful hits advance practice. Practice across several branches raises the cost of future practice; the window displays the current multiplier and practiced branches. Kills no longer grant generic level XP. Overall learning level is one plus earned skill levels; further practice grows more expensive as that total rises.

Faith is its own ten-level skill. Hearth restores health and permits resurrection, Road restores energy, and Lantern restores mana. Change patrons near a cleric or shrine. Their moods change with the world clock and affect the chance and strength of a gift; a resurrection ritual can fail. At low faith the client receives only a vague omen. Faith 4 provides a hint, faith 7 reveals mood and success chance, and faith 10 reveals the countdown. The UI only displays information present in the authoritative snapshot.

Arcana grows through three finite book chapters at the scholar and teaching a genuinely unlearned friendly character. Reading a completed chapter again or repeating an already-known lesson does not farm practice. Teaching requires that the teacher knows Fireball and the student is alive and nearby.

## Guild contracts and parties

The guild is one optional activity alongside residents' personal quests. At Mira or Savva, take a slime hunt, skeleton hunt or frontier survey. Solo characters can take contracts. Players can also invite up to three other nearby players (240 world units, same location); invitations expire after 30 seconds. The leader accepts and turns in the group's contract within 64 world units of a guild representative. The window shows each member's presence, location and contribution. Contract participants are fixed when accepted; later recruits can help but do not gain a reward entitlement. Leaving or permanent death removes that entitlement. Companions join by consent through their separate requests, and qualifying nearby companion kills count toward their leader's contribution.

The current region is a 5×5 grid with Novogorod at `map-2-2`. Each location is 96×80 tiles (1536×1280 world units). The city has streets, walls, gates, a market/guild square, residential buildings, a temple and workshops. All eleven city buildings have walkable doors and furnished interiors. Their roofs disappear while the local player is inside; residents behind closed roofs are not drawn through them. Walls and furniture use the authoritative collision grid. Mira is in the guild, Savva in his shop, Vera in the chapel, Aren in the library, and Lea and Bran in the tavern. Six additional residents occupy the workshop, smithy and homes; they have their own greetings without gaining merchant privileges.

Danger is the number of cardinal location crossings from the city: 0 in Novogorod, 1 in its closest suburbs, up to 4 in the corners. The city has no hostile spawns. Other locations have 3–6 enemies in groups. Health multipliers by danger are 2.2/2.8/3.4/4.0 and damage multipliers are 1.8/2.2/2.6/3.0 against the base archetype. Prepare a party of 2–4 with weapons, food and healing; even the closest outskirts are deliberately punishing alone. Player stats do not change with party size. Enemies alert nearby allies on a visible target, with bounded alert lifetime, pursuit and spawn leash; alerts do not relay indefinitely. Retreating and avoiding combat remain possible. A deterministic test exercises the actual combat simulation: a lone unprepared or sword-equipped fighter loses to the starting pack, while four sword-equipped allies win. This establishes the intended direction, not a guarantee for every encounter or skill level. Location changes preserve the character and use the same movement and collision rules. The minimap shows all 25 locations, the city and their danger levels. Multiple cities, local supply/demand markets and trade routes remain future direction.

City art uses Kenney Tiny Town 1.1; the four outskirts farms use Tiny Farm 1.0, both under CC0. Its source and bundled license are recorded in `docs/asset-credits.md`. Run `node scripts/generate-world.mjs` to regenerate the deterministic maps; `map1.json` is a compatibility alias for the central city.

## Farms and provisions

Each cardinal suburb has a farm with an enterable barn and three shared wheat beds. One bed per farm begins ripe. Approach a bed and use E to sow or harvest. Sowing consumes 5 energy and the community supplies seed; wheat ripens after 45 seconds of server time. Harvesting grants 3 grain and leaves the bed bare. The new bread recipe consumes 3 grain and produces one ordinary food item. These actions use the same character state and validated command path as other interactions.

The twelve plots belong to the world session: two players cannot harvest the same crop twice, commands cannot shorten growth, and remote/dead/offline characters cannot work the field. Labor has an 800 ms cooldown. The authoritative snapshot supplies phase and readyAt; the client displays time and crop art without awarding resources. Restarting the in-memory server resets crops along with the rest of the world.

## Movement sounds and keyboard interaction

Footsteps come from the hidden authored `Footstep surfaces` Tiled layer. Grass and soil use soft clips, stone uses dry concrete steps and wooden interiors use wood steps, with three variations per material. Slimes retain their own hopping sound. Audible footsteps include other living characters in the current location and fall off quadratically, with a normal walking range of 240 world units. Sneaking is quieter with shorter range; dashing is louder and carries farther. Movement must actually change position; standing against a wall, death, map changes and large snapshot jumps do not produce fake steps. Each playing voice has its own gain and the mixer limits simultaneous steps; hiding the page or stopping the game clears them.

The context action menu follows the focus and activation conventions in [W3C APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and [Menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/). The broader idea of one nearby action key is also present in [Stardew Valley controls](https://stardewvalleywiki.com/Controls); Ratata uses E as requested rather than copying that game's bindings.

## Stealth and world interactions

Sneaking moves at 45% speed and reduces footstep noise to 18%. Space dashes in the movement/facing direction at 160% speed for 600 ms, costs 30 energy and has a 2.5-second cooldown. Dashes obey swept collision and do not grant invulnerability. These are shared server rules for all characters and agent commands, not local speed multipliers. There is no separate sprint mode or Shift acceleration. Space requests the dash; a private temporary notice explains insufficient energy, an unfinished cooldown or an action lock. Hostile skeletons and slimes can close a visible pursuit gap with the same paid dash. They reserve energy for an attack, verify a clear collision corridor, and do not dash blindly toward sounds or through walls.

Hostile mobs hear actual displacement on authored surfaces: grass is quieter than wood or stone. Dashing can attract enemies from beyond normal sight. Sneaking also reduces sight detection range, but does not make a character invisible at close range. A noise or ally alert records a last-known point; an investigating mob does not track an unseen character's current coordinates. Walls damp noise and alert reports expire. Stealth is useful for choosing a route around a pack, not a guarantee when walking directly into it.

Face a nearby chest and press E to inspect the selected container. Its window shows the backpack on the left and shared chest contents on the right. Left/right arrows switch sides, up/down or W/S selects a row, and E confirms the transfer. Escape closes either the chest window or the standalone inventory, including after clicking its background. Transfer an individual item in either direction or use **Забрать всё** to transfer as many items as fit into the backpack. Anything that does not fit remains in the chest. Opening alone leaves the contents inside; striking the chest spills its remaining contents onto the ground. Every transfer uses the original item instance and is resolved once on the server, including when several players inspect the same chest. The window closes when the character leaves reach, changes location, disconnects or dies.

Permanent map banners are hidden; a nearby sign shows its name while the living character faces it, or in any direction while standing on its footprint (with a 4px foot margin), without opening a modal, and E reads its authored details. Turning away outside that footprint or walking away hides the reading hint; no permanent discovery label is added. Sign descriptions contain only a short, specific instruction for their place or destination.

Wells, troughs and marked water edges let a character drink, restoring up to 15 energy with a shared five-second drinking cooldown; drinking does not heal HP. Barrels have solid footprints and shared, finite communal supplies (one wood and one fiber per barrel). A searched barrel remains empty for everyone in the current world session. Range, life, action locks and line of sight are validated by the server.

Action-result notifications disappear after five seconds. Each new adventure or party result has a server receipt, so repeated snapshots never extend the toast and a new action with the same wording can still show it again. Quest, inventory and party state remain available in their windows.

Materials are ordinary backpack item instances: herbs and grain stack to nine per slot; wood, fiber and scrap occupy one slot per unit. The backpack holds 50 occupied slots, including equipment carried in the bag, food, hearts and material stacks. Gathering, harvesting and barrel supplies check the entire result fits before spending energy or depleting the source. Crafting consumes real carried material quantities and checks the finished item fits after ingredient consumption. Crafting summaries are derived from backpack contents, not a separate wallet. Chest, ground, theft and backpack transfers preserve whole-stack quantities. E performs a selected target’s sole action directly; its multiple actions use a vertical menu. Dialogue choices are vertical; **Покажи товары** opens a separate shop view, with a button or Escape returning to the conversation.

Trees and tall props are complete cached sprites sorted by their ground contact Y; grass and paving remain below them. Generated clearing boundaries remove complete obstructing props rather than cutting individual tiles. Furniture footprints, visible composites and collision data are authored together.

## Theft and practical stealth

C enables sneaking. Approach a living NPC or player within 28 world units, then use E and choose **Попытаться украсть**. The server validates reach, line of sight, action readiness, 10 energy and capacity. Each paid attempt has an 8-second cooldown; retrying the same target requires 60 seconds. Empty pockets and invalid attempts give no practice. The theft action takes one existing, unequipped item or whole material stack from the victim's inventory; equipped items are not pickpocketed. Stack limits and receiving capacity are checked before the transfer. Named residents start with finite authored pocket contents, independent of shop offers. Nothing is generated on demand by stealing.

An undetected success transfers the same item instance atomically. It raises theft and stealth practice. A paid failed attempt still practices theft; standing with C enabled or retrying rejected commands does not. The target's facing and both learned skills affect the roll, with a remaining risk even at high levels. An undetected failure or success sends no accusation to the victim. Normal character snapshots reveal only the viewer's own bag and exact practice counters. Other characters' equipment and attained skill levels remain visible; hidden practice does not reveal an unnoticed attempt.

On detection, combat-capable NPCs defend themselves and noncombatants flee and can call the city guard. A human-controlled victim retains control and receives a private warning. **Позвать стражу** is available for 30 seconds after a witnessed attempt. It requests a temporary response; arbitrary accusations are rejected. Retaliation uses ordinary movement and combat and is limited to the actual participants. Pursuit remembers the last-known point when sight is lost.

A witnessed theft also provides five minutes to file **Пожаловаться на …** via E near a living city guard, within 64 world units and line of sight. Calling for immediate help does not consume this evidence. The formal complaint enters the offender's current identity in Novogorod's blacklist. Leaving the location or disconnecting does not clear the record: city guards attack on encountering the offender, and both city merchants refuse purchases, including through an already open shop. The blacklist has no automatic 30-second expiry. These consequences currently apply to Novogorod; there is no general reputation, fine collection or jail system.

Approach **Сестра Вера** in the chapel and choose **Отпустить грехи · 30 золотых**. The shared server rule validates the living cleric, reach, line of sight, action readiness, blacklist and balance before one atomic payment. It clears the city record, outstanding old evidence and related pursuit/retaliation; replaying the command does not charge again. An old complaint cannot immediately restore a forgiven record. Quest rewards remain available to earn the fee while merchants refuse trade. Resurrection preserves the same identity and its record; permanent death ends that identity and a new character begins clean. All records are currently in server memory, so a server restart starts a new world session.

Stealth also practices through actual unseen movement near an observer: at least 64 world units across four new cells, with a four-second award interval and a minute before repeated ground counts again. Safe crouching, movement into a wall, following one's own companion or pacing beside allied human players does not train it. Higher stealth reduces sight detection and footstep loudness. **Знания** shows both skills in **Хитрость**; they use the common increasing practice costs, multiclass penalty and permanent-death reset.

Positive authoritative damage events trigger a short recoil pose, a red flash and a rising damage number. These are visual feedback only; death takes presentation priority and misses do not show a hit. Building facades sort at their front ground line, so characters standing in front remain visible while characters inside the footprint stay behind the cover until entering.

## Искра, Эхо and companions

Искра and Эхо are world concepts, independent of who controls a character. An Искра carries an individual will and can form new commitments. An Эхо repeats a purpose, habit or memory of a place. Neither concept determines speech, intelligence, combat ability or the current controller. A speaking slime is possible; a silent person is possible. A human, model or script can supply intentions to the same `GameCharacter`.

Open **Спутники** near city residents. The panel shows their nature, actual control source, speech capability, personality, current agreement and last reply. You make requests within 64 world units; characters may refuse. The princess can travel after an introduction and refuses combat. The veteran can accompany and fight. The guard protects his post and declines travel. Speech does not require movement or combat, and talking does not force someone to follow.

The running personalities use local authored rules. The UI reports **Сценарий** for that controller. It reports **Модель** only when an external agent has supplied an accepted intention; this is a temporary control lease, not evidence of a built-in paid language-model service. Conversation policy, narration and character simulation remain separate.

## External agent MCP

The optional native stdio MCP server controls eligible NPCs through the same authoritative intentions. It does not edit their coordinates, HP or inventory. Start the backend with a `GAME_AGENT_TOKEN`, then launch the MCP process with the same token:

```sh
GAME_AGENT_URL=http://127.0.0.1:3000 GAME_AGENT_TOKEN=your-local-token-at-least-24-characters bun scripts/agent-mcp.mjs
```

The tools are `ratata_observe` (optional `locationId`) and `ratata_act` (`actorId` and a `decision`: `move`, `move_to`, `movement_mode`, `dash`, `attack`, `open_chest`, `take_chest_item`, `take_all_chest_items`, `take_chest_gold`, `put_chest_item`, `close_chest`, `steal`, `call_guards`, `report_theft`, `absolve`, `speak` or `wait`). The URL must be local and the matching token must contain at least 24 characters. Without a backend token the HTTP agent routes are disabled. Chest commands use the same shared rules; their agent action result includes only that controlled NPC’s validated `chest` view, while the global observation response does not expose container contents. The model control lease lasts 5 seconds, then the scripted controller resumes; `wait` releases it immediately. This bridge does not require or modify global Codex configuration. Browser `window.__ratataTest` remains the independent player-testing interface.

## Hotbar, target focus and combat feedback

The four 48px action slots start empty for each new character identity. Use Shift+1–4 to choose a known ability, an apple, or clear a slot. Press 1–4 to activate. Apples bind by item type, consume a real inventory instance and retain their icon at zero quantity. Cooldowns and resource requirements are checked again by the server. A bound prayer shows its exact target, cost and possible allied/self victims before pressing its key; its harmful 48px wave is outlined in the world, with warning markers on visible affected allies and yourself.

Each assigned slot also has an **×** button labeled **Очистить слот N**, reachable with Tab and activated with Enter or Space. Clearing removes only that slot's binding, keeps every item in the inventory and returns keyboard focus to the now-empty slot.

In the inventory, focus an apple's slot and press Shift+1–4 to bind it directly; Enter is not required. After selecting the apple with Enter or a click, the same shortcuts and numbered assignment buttons also work. The inventory stays open and keeps keyboard focus; assigning a slot does not eat the apple. Close the inventory with Esc, then press the slot's number to eat it.

Use arrows to move between inventory cells and Enter or E to open and confirm item actions. When equipping, consuming or transferring removes the selected item from the bag, keyboard focus returns to the same cell, even if it becomes empty. Continue with the arrows without reopening the inventory. A rejected action keeps its current menu and focus.

T cycles visible hostile targets; Shift+T cycles allies and recoverable bodies; F selects yourself. Q toggles automatic attacks on the selected living enemy, or makes one ordinary attack without an enemy selected. E opens the selected reachable target's actions, or uses the facing interaction when there is no selected target. Any friendly reachable character offers **Следовать**. Friendly targets use a circle and shield, hostile targets a diamond and crossed swords; objects retain gold corners. Manual movement, stun, death, window focus loss and Esc cancel automatic control. Follow can continue across adjacent locations using ordinary movement. Menus consume gameplay keys and release held movement.

The party panel puts the crowned leader first, shows names and HP percentages with a thin bar, and marks distant, offline or fallen members. Incoming invitations offer acceptance/refusal; pending invitations cannot be sent back to their sender.

Arrows and blue-violet sparks use the ability's server windup and selected target. Prayers show distinct Hearth flame, Road wind, Lantern constellation and Grave broken-ring motifs. Healing labels name HP, energy or mana; resurrection has a three-second casting arc and rising completion mark. Only confirmed damage or absorption creates a harmful wave and victim flares. Barriers have facets and crumble when their authoritative state ends. Stun displays **СТАН 0.9** from authoritative remaining time.

Cached Canvas graphics and bounded Excalibur ParticleEmitter bursts share a conservative 32-view scene budget: eight damage reactions, twelve transient spell/status effects, six barriers and six stun labels. Particle reservations never exceed 192. Scene changes and disposal clear effects; reduced motion preserves readable labels and stationary marks while suppressing travel, expansion, shake and particles.

Melee and skeleton strike arcs begin at the same world anchor as the attacker's yellow attack zones, without the torso offset used by spell effects. They point toward the authoritative target, falling back to facing for an untargeted swing. Their initial position and heading stay fixed for that swing; reduced motion keeps the same direction. The curved swing is visual feedback; the yellow rectangles show the server's actual hit area.

## Speech bubbles and dialogue keys

Each NPC reply appears once in an opaque ivory bubble anchored to the visible speaker. Its tail uses the bubble's measured height, including short replies; edges clamp to the viewport and long text scrolls within a maximum 360px width. Choices and shops stay in their accessible panel without repeating the paragraph. Signs retain their readable text.

From dialogue choices, **PageUp/PageDown** focuses and scrolls the speech text. **Tab/Shift+Tab** cycle between the replies and bubble; **Esc** closes the owning dialogue even after clicking the background. The same opening key does not activate the first reply. The active reply remains until the conversation closes, loses reach or its speaker disappears. Ambient speech expires and never returns from an old receipt. Every new authoritative reply, including repeated equal text, has its own speech receipt; snapshot reads retain that receipt. Personalized NPC replies are visible only to their intended recipient.

## Run locally

```sh
bun install --frozen-lockfile
bun run build
GAME_MAP_ROOT="$PWD/apps/frontend/public/game/map" bun dist/backend/index.js
# in another terminal:
bun run --cwd apps/frontend preview
```

The built client runs at http://localhost:4173 and connects to the backend on port 3000. Alternatively use `bun run dev:backend` and `bun run dev:frontend`. World state currently lives in server memory; restarting the backend begins a new world session.

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

Backend tests cover combat reach, map connectivity, crossings, isolated locations, quest credit, reward duplication, gathering/crafting, progression, resurrection/permadeath, atomic theft, private outcomes and bounded crime reactions. Frontend tests cover controls, theft interactions, hit presentation and movement cleanup. Use `bun run type-check`, `bun run lint`, `bun run test` and headless browser checks after changes.

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
- Future cities should support local supply, demand and goods, producing reasons to travel, trade, escort caravans and take personal contracts. Markets and routes belong to world data. The 25 existing locations form a test region, not a completed trading economy.

Terrain borders use connected atlas quadrants, including diagonal concave corners at road junctions and pond shores. Final generation removes isolated pond fragments smaller than a coherent 3×3 area before creating water interactions and collision metadata.

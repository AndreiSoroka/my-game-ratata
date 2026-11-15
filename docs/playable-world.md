# Ash Border: playable world

The first scenario is authored AI-generated content: 25 deterministic maps in the Lands of Novogorod and a stateful quest. No external language model or paid API is called at runtime. The generation boundary is separate from simulation: `scripts/generate-world.mjs` builds Tiled maps, `adventureContent.ts` defines the initial story, and authoritative server events update the story state. A future model can generate validated content once and issue the same client commands used by the player and test interface.

## Play

Choose a name and one of four starting backgrounds. A background provides initial advantages; it does not lock future skills. Start without gold or equipment. Gather nearby herbs, fiber and scrap or harvest ripe grain; sell supplies in town to afford a tool, or craft food and boots. Barrels also contain finite communal wood. Buy an axe or pickaxe from Ignat in the smithy before gathering trees or stone. Enter the guild building and talk to Mira in Novogorod to accept the bell quest. Hostile scripted slimes leave one real slime-heart item inside a shared corpse when defeated, even before the quest is accepted. Search corpses and take three hearts into your backpack and bring them to Mira; delivery consumes those three item instances and pays the reward once. Hearts stored in a chest or dropped on the ground do not count until carried again. Kill statistics are separate from the delivery objective. Restore the bell after the delivery. Savva sells supplies in his shop south of the square. Resource deposits are shared and exhaustible.

Vanguard fights in melee with 150 energy and a 20% damage advantage; Ranger starts with the ranged Shot; Arcanist starts with Spark and Barrier; Cleric starts with Prayer and resurrection knowledge. Every background's basic attack is a short melee strike using equipped weapon condition, without a mana cost. Skeletons share the same model and use a paid Bone Strike that can stun for 0.8 seconds. Everyone can learn swordsmanship, miracles and fire magic. All use `GameCharacter`, common combat, movement, resources, cooldowns and progression. Their configuration and controller are the differences.

Ranger's ordinary attack is a melee weapon strike or punch, separate from **Выстрел**.
Shot remains the default first slot. Without a selected target it fires straight
along the current facing, spending the same energy and cooldown. A forward hit can
damage a visible enemy; empty shots do not award practice. Automatic untargeted
shots keep that forward intention rather than selecting a different enemy.

Mobs yield and step sideways with ordinary collision-resolved movement when allies
overlap or share their next waypoint. They retain their own paths and attack rules;
crowd avoidance never pushes a player or relocates an actor. Slime spawn positions
prefer authored, walkable natural shorelines, including large lakes, with a valid
fallback on maps without suitable water.

WASD/arrows move, click empty ground walks to a point, C toggles sneaking, Space dashes, I opens inventory and Enter opens chat. T cycles visible enemies; Shift+T cycles allies, including fallen allies still eligible for rescue; F selects yourself. Clicking a hostile character selects that exact target, while clicking a friendly character opens its reachable actions. Slot 1 starts with basic melee attack; slot 2 contains Shot, Spark or Prayer for the corresponding background and is empty for Vanguard. Press 1–4 once to act; press the same key twice within 300 ms to repeat on the server; press it again to stop. Manual movement, text/menu focus, blur, hidden pages, death and stun release held control. A lost target never silently substitutes its neighbor.

Ordinary HUD button focus still permits gameplay shortcuts, including I; Enter, Space and E confirm the focused button. Actual windows and text fields own their input. Escape performs one operation per press: close the game menu, handle the current chat/window, cancel a ritual or automated action/target, then open the game menu if nothing remains to cancel. Holding Escape does not advance through these steps. The visible menu button also works on touch screens. **Вернуться в игру** resumes input; **Выйти из игры** disconnects and returns to sign-in without abandoning the character, including during the resurrection window. Signing in with the same name resumes the existing living identity. The server world continues while the menu is open.

The compact character panel centers an ellipsized nickname on a full-width red ribbon, with small accessible Spark/Echo and speech icons inside its right edge. HP/MP/EN show only filled bars by default, including the character's own resources. Authorized numeric values round to the nearest integer; full names remain available in the heading's accessible name and tooltip. Temporary action notices appear at the top center for five seconds. Crime notices remain contextual; connection errors appear separately. Gold and item condition stay inside the inventory.

A fallen hero has 60 seconds to be resurrected. A living character who knows the matching Hearth or Grave prayer and is a cleric or has that school’s Miracles level 5, within the spell’s effective radius, channels for 3 seconds and spends 20 mana. Death, distance, location, stun and deadline are checked again at completion. Sister Vera lives in the chapel; a rescuer must still reach the fallen character before the deadline. Resurrection retains identity and belongings. At expiry all carried items, equipment and gold transfer into a shared corpse before the hero is removed. Skill knowledge and personal quest state end with that identity; starting again creates a new server identity even with the same nickname. Ordinary NPCs leave a corpse immediately and retain their shared-model respawn policy, without restoring the possessions they dropped.

During the rescue window, **Начать сначала** voluntarily ends that identity and
opens character/background selection immediately after the server confirms final
death. Resurrection is then unavailable; possessions and gold remain in the shared
corpse. The new character does not inherit the old inventory, skills or orders.

Final player death also leaves a persistent grave at the death location, separate
from the loot container. Its first skeleton appears after thirty seconds of server
time; later births occur at most once per ten minutes. Authored wilderness graves
use the same ten-minute rule, with initial skeletons counted toward their source.
Each grave permits at most three living descendants, including those that travel
away. A full source skips its deadline rather than saving instant replacements.
Dead grave skeletons never revive themselves; a later birth is a new ordinary mob.
Blocked or occupied spawn ground delays the birth. Grave markers survive emptying
the corpse, and death graves can exist in the city although its initial encounters
remain empty.

Each source assigns one stable guardian from its existing living descendants. It patrols within 64 pixels, stops a distant home-map chase beyond 160 pixels and returns to the grave. Destruction keeps that duty; purification releases it. A dead guardian is replaced by an existing descendant, never by an extra birth.

Autonomous pursuers can follow an already hunted target through an actually observed exit for five seconds. They may visit one adjacent map, for at most ten seconds after their own crossing or 160 pixels from entry, then physically return within 24 pixels of home. A lost target, denied crossing or expired attack right also starts the return. Fresh sightings and damage do not extend this episode; a second foreign crossing is forbidden, including during a dash. Returning characters retain normal contact defense. Guards can briefly leave town to pursue a valid offender; absolution ends the right immediately. Monsters cannot enter the city, and city-born grave descendants remain there so they can always return home.

## Breaking and purifying graves

Every skeleton-producing grave, authored or created by final death, has 100 HP and
the stone material profile. Bare hands deal 10% damage, swords and axes 25%, a
pickaxe 100%, arrows 5%, and Spark/fireballs 25%. Mitigation follows the ordinary
damage roll and retains hundredths; weak arrow hits are not rounded up to one HP.
Costs, windup, range, line of sight and weapon wear remain shared combat rules.
Damage to a grave grants no combat practice, loot or kill reward.

At zero HP the marker becomes rubble and stops producing skeletons for thirty
minutes of server time. It then restores all HP and starts a fresh ten-minute birth
interval. Its existing living descendants still count toward the cap of three;
there is no instant catch-up spawn. A partially damaged grave continues producing.

Select a grave through **E** to inspect its condition/material, attack it or choose
**Упокоить могилу**. Any character with learned Hearth Prayer (`pray`) can contribute; energy, mana and Grave prayers cannot purify graves. Each completed
three-second attempt costs five mana, including a failed roll. Five successful
contributions purify a grave; the shared segmented ring shows progress. The neutral
initial success chance is 20%, scaled by mood and faith. Automatic prayer retains
its chosen grave, waits for mana and repeats until purification or target loss.
Movement, HP damage, stun, death, disconnect, lost reach/sight or cancellation
interrupt without payment. Progress survives interruptions, travel and destruction
or restoration of the grave during this world session. An unlocked area prayer can
restore allies and contribute to multiple reachable graves with one cost and roll.

Purification works on intact graves or rubble and permanently disables their source
for this world session. The marker disappears, including authored gravestones after
travel or reconnection. Existing skeletons and the independent corpse/loot remain.
Sources retain a disabled identity so they cannot be registered again, while dead
descendants still receive normal cleanup. These states currently live in server
memory; restarting the server resets the world.

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

Open **Персонаж** from the menu or **P** for **Характеристики** and **Развитие**.
Nine independent constellation masteries start at 0: Blade, Magic, Prayer, Arrow, Life,
Shadow, Road, Clarity and Ash. Prayer mastery is named **Чудеса**. Each living identity
has a stable personal star map centered on its initial class; discoveries, patron
changes, reconnects and temporary death preserve it. Layout randomness is private
and independent of combat and progression. Unknown grey stars cannot be clicked
or focused, and their metadata is not projected to the owner.

Thresholds follow Fibonacci: 100, 100, 200, 300, 500, 800… XP. Remainders carry, there
is no level 10 cap, and every attained level earns one random opening for that
constellation. Levels never pay for stars or directly increase damage/healing.
Equipment, baseline stats, moods and learned stars determine numerical effects.
All requirements—parents, level and knowledge—must hold before a random star enters
the pool. Normal star generations require levels 1, 3, 5, 7… Empty pools bank openings;
newly satisfied conditions resolve all eligible pending openings. Special event
stars remain free and cannot be substituted by a random discovery.

Constellation conflict reduces earned XP from all nine branches, including Life.
For own level L, total level T, and summed positive lag D, the multiplier is
`((L+2)/(T+2))^(2/3) * sqrt((L+2)/(L+2+D))`. One developed path has no penalty;
two paths at 10 give 20.03 of 30 XP. Frozen per-action factors and integer micro-XP
keep multi-target rewards stable. The previous global training-cost multiplier
and separate Faith/Miracles scales are removed. See
[Character development](character-development.md) for rewards, examples and controls.

Prayer channels for three seconds and costs five mana on completion. Empty
and failed requests give no XP. Each useful recipient earns 30 base XP; Kara earns 70
per hostile victim; grave steps earn 10 each and the final step 150 instead, 190 in all.
Resurrection earns 200. Resource gifts credit only genuinely useful resource loss,
never the prayers' own mana cost or repeated repayment of the same loss. Training
objects, artificial friendly injuries and empty applications remain untrainable.
The four prayers keep separate constellations and bonuses remain school-specific.
Mood controls the baseline success chances 80/55/25%; no level bonus applies.

Clerics start with Prayer and its passive Resurrection at mastery 0. Other classes
need the appropriate learned prayer and mastery 5; Ash revives undead, Mother
revives living species. Active stars represent assignable actions; enhancements
are labelled «Пассивный навык». A normal player click only reads a known star.

Fireball is learned from a living friendly scholar within 64 world units with Magic 3.
It costs 12 mana, range 160, cooldown 1 second. Greater Fireball requires Magic 10 and known
Fireball; it costs 24 mana, range 192, cooldown 2 seconds. Knowledge is stored independently
from mastery. Three finite chapters and successful teaching give 50 Magic XP; repeated
known chapters or lessons give none. Only the actual teacher earns teaching XP.

The standalone [debug atlas](http://localhost:4173/?debug=constellations) uses the
same mastery math and requirements without sending gameplay commands. Clicking
reads; Space toggles the chosen star, with explicit switches for touch use. Levels
are derived from the selected plan and gates. The summary shows conflict, useful
XP and actions to the next level; formulas and unlock conditions start collapsed.
The plan shows unassigned openings explicitly instead of assuming unknown bonuses.

## Guild contracts and parties

The guild is one optional activity alongside residents' personal quests. At Mira or Savva, take a slime hunt, skeleton hunt or frontier survey. Solo characters can take contracts. Players can also invite up to three other nearby players (240 world units, same location); invitations expire after 30 seconds. The leader accepts and turns in the group's contract within 64 world units of a guild representative. The window shows each member's presence, location and contribution. Before accepting any quest, including Mira's personal story, choose **Вся награда сдающему** or **Поровну группе** (the default). This choice is fixed for that quest. The displayed gold is one total budget: hunts/survey pay 30/40/35 gold, not that amount per person. Equal distribution uses the current party at turn-in, including late joiners without personal contribution; members who left receive nothing. Whole coins are divided evenly, with leftover coins assigned one each starting with the submitter and then stable character IDs. Receiving a share of another person's quest does not complete your own story. The journal shows active story and guild quests, their fixed reward mode and actual paid shares. Companions join by consent through their separate requests, and qualifying nearby companion kills count toward their leader's contribution.

The current region is a 5×5 grid with Novogorod at `map-2-2`. Each location is 96×80 tiles (1536×1280 world units). The city has streets, walls, gates, a market/guild square, residential buildings, a temple and workshops. All eleven city buildings have walkable doors and furnished interiors. Their roofs disappear while the local player is inside; residents behind closed roofs are not drawn through them. Walls and furniture use the authoritative collision grid. Mira is in the guild, Savva in his shop, Vera in the chapel, Aren in the library, and Lea and Bran in the tavern. Six additional residents occupy the workshop, smithy and homes; Ignat provides equipment sales and repair, while other residents retain their own service roles and greetings.

Danger is the number of cardinal location crossings from the city: 0 in Novogorod, 1 in its closest suburbs, up to 4 in the corners. The city has no authored hostile encounters. Other locations have 3–6 enemies in groups. Health multipliers by danger are 2.2/2.8/3.4/4.0 and damage multipliers are 1.8/2.2/2.6/3.0 against the base archetype. Prepare a party of 2–4 with weapons, food and healing; even the closest outskirts are deliberately punishing alone. Player stats do not change with party size. Enemies keep fighting a directly visible opponent after leaving their spawn area. Indirect ally alerts and heard noises retain bounded lifetimes, investigation ranges and a home leash; alerts do not relay indefinitely or reveal an unseen opponent's live position. Retreating and avoiding combat remain possible. A deterministic test exercises the actual combat simulation: a lone unprepared or sword-equipped fighter loses to the starting pack, while four sword-equipped allies win. This establishes the intended direction, not a guarantee for every encounter or skill level. Location changes preserve the character and use the same movement and collision rules. The minimap shows all 25 locations, the city and their danger levels. Novogorod has a shared supply/demand market; additional cities and trade routes remain future direction.

City art uses Kenney Tiny Town 1.1; the four outskirts farms use Tiny Farm 1.0, both under CC0. Its source and bundled license are recorded in `docs/asset-credits.md`. Run `node scripts/generate-world.mjs` to regenerate the deterministic maps, or append `--location map-2-2` for the central city alone; `map1.json` is regenerated with its central-city source.

The training pen east of the square uses the original Mystic Woods wooden fence. Its outer tiles are x57–71, y43–56, with a three-tile west entrance at y48–50. The `Training grounds` map layer authors the 208×192 interior and dummy position with stable area/target IDs. Navigation and presentation read that shared metadata, independently of fence atlas tiles. The interior is reserved against planting and generated branches; city service routes are computed after placing the fence.

## Equipment condition and repair

Swords, tools and boots have condition attached to their item instance. The backpack
shows remaining condition and marks broken equipment. Dropping, trading, theft,
chest storage, resurrection and corpse loot preserve its condition; changing owners
never repairs an item. Broken items remain in the bag or equipment slot and can be
repaired. An equipped broken weapon cannot attack; unequip it to fight unarmed.
Broken boots stop granting their dodge bonus.

Both swords have 200 condition and lose one point per successful weapon hit.
An axe or pickaxe has 1,000 condition, loses one point per proper harvest and five
per successful combat hit. Chopping with a sword costs 20 condition per wood, so a
new sword lasts ten harvests while a proper axe lasts a thousand. Rejected actions,
misses and full-bag gathering refusals do not wear tools. Magic does not wear a
carried sword that was not used for the attack.

Boots have 1,000 condition. They lose one point per 960 world units actually walked
and one per hit that damages HP. Standing still, pushing against a wall, map
relocation and fully absorbed hits do not wear them. Partial walking wear stays on
the item through equipment changes and transfers. These rules apply equally to
players and NPCs; there is no extra death penalty to condition.

Talk to **Кузнец Игнат** and choose **Почини моё снаряжение** to repair a damaged
item or the displayed selection. Repair costs gold, not materials, and restores full
condition without reducing its maximum. The full repair price is 5 gold for an old
sword, 10 for a simple sword or tool, and 8 for boots; partial repairs cost the
proportional amount rounded up. The server rechecks ownership, condition, quote,
gold, reach, line of sight and access to the living smith before charging.

## Trees and stone

The inventory shows **Золото** even at zero, and **Прочность** as a percentage,
exact points and a bar for equipped, selected or keyboard-focused equipment.
These values come from server snapshots; broken equipment says it needs repair.

Ignat also sells and makes a **Каменный топор** for 10 gold. Its recipe uses two
stone and one wood. It harvests as quickly as an iron axe but has 100 condition
instead of 1,000, and uses the same equipment, wear and repair rules.

Forest resources are shared objects with stable identities and semantic sizes. One
click or **E** starts approaching and continuously gathering the selected source.
The first successful strike gives loot immediately; an axe repeats every two
seconds (5 energy), a sword every four seconds (10 energy), with their usual wear.
An adult tree gives eight wood; its final strike also gives two saplings and one
brushwood and leaves a stump. A small tree, including the seven small city pines,
gives two wood and final brushwood, then disappears. The complete strike's output
must fit in the bag before any costs or source changes. Becoming a stump ends
harvesting; clearing it is a separate axe action that gives one wood.

Bushes give one brushwood per strike, twice: hands take 800 ms and 1 energy; an axe
400 ms, 1 energy and 1 condition; a sword 600 ms, 2 energy and 1 condition. Dry
branches give one brushwood with an 800 ms interval and no tool or energy cost.
Bushes and branches do not regenerate in the current server session. Brushwood is
an ordinary item stacked to nine, used by the city for kindling and heating.

Manual movement, **Esc**, another command, equipment changes, actual damage,
stunning, death, disconnect and travel stop automatic work. Insufficient energy,
space, broken tools or lost access also stop it. Cancellation keeps all earned
items and the server cooldown, immediately releases work movement, and never
selects another source or resumes by itself.

Apple trees retain their authored fruit profile. Each successful wood strike,
including the final one, can drop a real apple onto nearby ground (20% chance),
which must be picked up normally. Rejected work cannot roll for apples. Ordinary
forest trees and pines do not drop food.

Assign **Саженец** to any hotbar slot with the existing assignment picker (Shift +
the slot key), then click or press that slot to select a plot. Its assignment
remains when the bag is empty. A compact hint follows the plot and camera; arrows
move the selection, **E / Enter** or clicking confirms, **Esc** cancels. On a phone,
the first touch selects and the next touch or hint button confirms. The future
trunk is gray while checking or forbidden and yellow only after the private server
preview accepts it. Invalid confirmation keeps selection open with a short reason.

Confirmation starts ordinary pathfinding to a free point beside the plot. Before
planting the server rechecks ground, paths, occupancy, energy and inventory, then
atomically consumes one sapling and 5 energy. Cancellation before planting costs
nothing; ten seconds without movement progress stops the intention. Roads, water,
farms, buildings, occupied footprints and narrow passages are excluded. A stump
must first be cleared with a working axe. Removed sources free collision and soil;
each new planting gets a new ID. New saplings become adult forest trees after ten
server minutes; growth waits for a free future trunk. **E** on a growing sapling
shows growth information and a separate **Срубить без добычи** action, using an axe
or sword with normal chopping costs.

Equip a pickaxe to mine marked stone formations. A harvest costs 5 energy, one
condition and a two-second interval. Each formation contains eight stone and becomes
depleted when empty; it restores after twenty minutes, subject to a free footprint.
Tree and stone collision changes are authoritative and update navigation as well as
the displayed world. Resource state belongs to the current server session.

## City supply and demand

Savva and Mira use Novogorod's same finite warehouse; Ignat sells its equipment.
Axes, pickaxes and simple swords cost 25 gold, boots 18. Resource and food prices
change with actual stock. Trade moves existing items between the bag and warehouse;
opening a shop, reconnecting or respawning never restocks it. Equipment resale is
not offered. Food remains the existing consumable healing 10 HP; there is no hunger
or spoilage system.

At the guild, ask Mira **Что нужно городу?** for current stock, ordinary target,
reserve capacity, consumption per ten minutes, recent deliveries and consumption,
and current buying/selling prices. Brushwood starts at 6, has normal target 12 and capacity 24, and consumes one real
unit per ten minutes. Its base price is one gold; severe shortage raises the city
buying price to two. Wood's normal target is 12, reserve capacity 24,
and consumption two units per ten minutes. Stone, scrap and fiber consume one each;
herbs and grain two each; food four each. Consumption removes real warehouse goods,
never takes stock below zero and does not accumulate a debt while empty.

The city pays more during shortages and reduces its offer as the warehouse fills.
At the ordinary target it offers one gold per unit; at the reserve limit it stops
buying that resource. Its sale price uses the same stock boundary plus a spread, so
immediately reversing a transaction loses gold. A bulk quote sums each unit's price
as stock changes. The server rejects a changed quote instead of silently charging a
different total. Repeating a request cannot transfer goods or charge twice. A city
crime record blocks trading and repair until absolution clears it.

Each city's warehouse and consumption settings are separate data; only Novogorod
exists in the playable region. Initial stock is authored once at world startup.
Current storage remains in memory, so a server restart resets stock, condition and
resource state along with the world; this is not durable persistence.

Three scripted workers use the ordinary character rules: Danila harvests wood,
Gordey gathers stone and scrap, and Agafya works the existing shared wheat plots.
They walk to sources, carry actual items, return to Savva to sell and visit Ignat
for paid repairs. Work is paced according to shortages; a timer does not add goods
to the warehouse. Threats interrupt work and workers can die. Initial tools and
small purses are authored once, not recreated after loss. Danila can plant carried
saplings through the same placement checks as a player. Lumberjacks sell wood
before carried brushwood and skip full market rows. When ordinary wood work is
unavailable and brushwood stock is below 12, one independent supplemental gather
per ten-minute work period may use a ready visible bush or branches within 160
pixels in the current location, with a reachable approach. Side brushwood from
chopping does not use that budget. Brushwood travels with wood or sells when the
worker is already in town; it never triggers a separate long trip.

## Workers asking for help

An outdoor worker who sees a hostile creature retains its worksite and the first observed threat, stops production and walks to the settlement clerk through ordinary location exits. Novogorod workers report to Mira. Each worker publishes a separate 30-gold request only after arriving, then visibly waits nearby. One player or party claims the request through the guild board; it occupies the usual active-contract slot.

Bring one matching trophy to the clerk and choose **Сообщить о расчистке**: a skeleton requires one `bone`, a slime one `slime_heart`. The item must be in the submitter's bag; an older or another player's trophy is valid. Hostile scripted skeletons now leave one bone in their shared corpse in addition to actual equipment. One death creates its trophy once. The request consumes a trophy only on its first report; retries keep that proof.

The worker walks back to the same worksite, performs one accepted ordinary work action (sow/harvest, wood gathering, or stone/scrap gathering), and returns to Mira. The trip does not require a market sale or the full routine production batch. New danger interrupts the attempt and sends the worker back. Missing seeds, broken tools, occupied bag slots or exhausted sources are reported as work obstacles; they do not grant progress.

After a successful trip, return to the clerk and claim the reward manually. The server rechecks living hostiles within 160 world pixels and line of sight at the original incident and tested work point. Renewed danger requires another trial without another trophy. Paying closes the incident and releases the worker to ordinary production exactly once. Stocks continue to deplete while workers wait; no separate shortage timer creates or removes goods.

Requests pause while their worker awaits resurrection and cancel without reward after permanent death. A leader can explicitly abandon a claim. When every current assignee is disconnected, the claim becomes public after five minutes, retaining its previously submitted proof. World and quest state remain in memory for the current server session.

Ignat, Mila and Elisey replenish equipment or food only from existing warehouse
ingredients. They take inputs into their own inventories, use ordinary crafting
and deliver the created item. A completed job is followed by a thirty-second work
interval; absent ingredients stop production. There are no automatic imports,
infinite merchant goods or off-screen delivery rewards.

## Artisan purchases and orders

Ignat, Mila and Elisey offer direct **Купить** and **Заказать** actions; Ignat also
offers **Ремонт**. Their shared workshop definitions determine the catalogue and
server permissions. Mila sells boots and Elisey sells food. Savva resells warehouse
goods but does not accept production orders.

Buy available goods immediately. If a workshop item is out of stock, order one
with half its frozen full price paid now, rounded up, and the remainder on pickup
(25 gold means 13 now and 12 later). The confirmation shows both payments and the
non-refundable deposit. Each living identity may have one unfinished order per
workshop. Statuses show missing materials, the production queue and readiness.

Fulfillable paid orders precede public replenishment in arrival order, after any
already-started job. Production still uses real ingredients and the thirty-second
work interval. The actual crafted instance is reserved outside public stock and
consumption; collection checks the original owner, balance, bag space and access
to the living artisan atomically. Lost materials or an unavailable artisan delay
work without replacing missing possessions.

Travel, reconnection and resurrection retain orders. Permanent death starts one
ten-minute reservation deadline; a new identity cannot inherit the order. Unstarted
work loses priority. A ready result becomes public at the deadline, including a
result completed later. Voluntary cancellation keeps the deposit and releases a
ready result, or makes an already-started result public when finished. Released
goods may exceed the warehouse procurement limit without disappearing. Orders,
like the rest of this world, remain in memory and reset on server restart.

## Drinking from ponds

Natural ponds of up to 64 connected water cells have one interaction target for
their entire actual shoreline. Selection outlines the pond contour, and server
reach, client selection and agent navigation share the same precise geometry.
Dry corners inside a bounding rectangle do not count as water. The generator
setting controls the threshold; larger natural lakes offer no drinking action.
Wells and troughs keep their authored areas. Drinking still requires reach within
48 world units, a clear approach and the five-second cooldown.

## Farms and provisions

Each cardinal suburb has a farm with an enterable barn and three shared wheat beds. One bed per farm begins ripe. Approach a bed and use E to sow or harvest. Sowing consumes one actual wheat seed from the backpack and 5 energy; wheat ripens after 45 seconds of server time. Wheat seeds are separate from grain and stack to nine per slot. New players receive no seeds automatically. Each farm has a shared supply chest: when the world session starts it has a 50% chance to contain two to four seeds, with each quantity equally likely. A failed roll leaves it empty. Inspection, travel and reconnecting never refill it. Savva also sells seeds from a finite initial stock of six through ordinary market trades.

Harvesting grants 3 grain and leaves the bed bare. It also gives zero seeds with 50% probability, one with 30%, two with 15% or three with 5%. The server fixes this hidden result once per crop, including initially ripe beds; retrying with a full backpack cannot reroll it. Grain and seeds must all fit before the crop is harvested. The bread recipe consumes 3 grain and produces one ordinary food item. These actions use the same character state and validated command path for every controller.

Agafya keeps harvested seeds for planting. Without seeds she reserves one grain for city supply and sells the rest. At the city supplier, an assigned farmer can exchange one real carried grain for one seed; without grain the city subsidizes one seed for the next sowing. This municipal source is separate from retail seed stock. The server records the work cycle and outstanding supply: repeated requests cannot grant more seeds, a successful ordinary sow permits the next supply, and a lost seed postpones a new work attempt until the existing ten-minute cycle. Each six-grain work batch permits at most two seed advances. City supply does not waive the seed or energy cost of sowing.

The twelve plots belong to the world session: two players cannot harvest the same crop twice, commands cannot shorten growth, and remote/dead/offline characters cannot work the field. Labor has an 800 ms cooldown. The authoritative snapshot supplies phase and readyAt; the client displays time and crop art without awarding resources. Restarting the in-memory server resets crops along with the rest of the world.

## Movement sounds and keyboard interaction

The game menu has a **Без звука** toggle for music, footsteps and all event/UI sounds. Normal play saves this preference in the browser. `?test=1`, `?mute=1` and builds started with `VITE_GAME_AUDIO_MUTED=1` force silence before the first playback, regardless of saved settings; sound cannot be enabled within those sessions. Muting immediately stops current voices, and unmuting normal play resumes music at its authored volume while retaining the current footstep surface map.

Footsteps come from the hidden authored `Footstep surfaces` Tiled layer. Grass and soil use soft clips, stone uses dry concrete steps and wooden interiors use wood steps, with three variations per material. Slimes retain their own hopping sound. Audible footsteps include other living characters in the current location and fall off quadratically, with a normal walking range of 240 world units. Sneaking is quieter with shorter range; dashing is louder and carries farther. Movement must actually change position; standing against a wall, death, map changes and large snapshot jumps do not produce fake steps. Each playing voice has its own gain and the mixer limits simultaneous steps; hiding the page or stopping the game clears them.

The context action menu follows the focus and activation conventions in [W3C APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and [Menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/). The broader idea of one nearby action key is also present in [Stardew Valley controls](https://stardewvalleywiki.com/Controls); Ratata uses E as requested rather than copying that game's bindings.

## Stealth and world interactions

Sneaking moves at 45% speed and reduces footstep noise to 18%. Space dashes in the movement/facing direction at 160% speed for 600 ms, costs 30 energy and has a 2.5-second cooldown. Dashes obey swept collision and do not grant invulnerability. These are shared server rules for all characters and agent commands, not local speed multipliers. There is no separate sprint mode or Shift acceleration. Space requests the dash; a private temporary notice explains insufficient energy, an unfinished cooldown or an action lock. Hostile skeletons and slimes can close a visible pursuit gap with the same paid dash. They reserve energy for an attack, verify a clear collision corridor, and do not dash blindly toward sounds or through walls.

Hostile mobs hear actual displacement on authored surfaces: grass is quieter than wood or stone. Dashing can attract enemies from beyond normal sight. Sneaking also reduces sight detection range, but does not make a character invisible at close range. A noise or ally alert records a last-known point; an investigating mob does not track an unseen character's current coordinates. Walls damp noise and alert reports expire. Stealth is useful for choosing a route around a pack, not a guarantee when walking directly into it.

Face a nearby chest and press E to inspect the selected container. Its window shows the backpack on the left and shared chest contents on the right. Left/right arrows switch sides, up/down or W/S selects a row, and E confirms the transfer. Escape closes either the chest window or the standalone inventory, including after clicking its background. Transfer an individual item in either direction or use **Забрать всё** to transfer as many items as fit into the backpack. Anything that does not fit remains in the chest. Opening alone leaves the contents inside; striking the chest spills its remaining contents onto the ground. Every transfer uses the original item instance and is resolved once on the server, including when several players inspect the same chest. The window closes when the character leaves reach, changes location, disconnects or dies.

Permanent map banners are hidden; a nearby sign shows its name while the living character faces it, or in any direction while standing on its footprint (with a 4px foot margin), without opening a modal, and E reads its authored details. Turning away outside that footprint or walking away hides the reading hint; no permanent discovery label is added. Sign descriptions contain only a short, specific instruction for their place or destination.

Wells, troughs and marked water edges let a character drink, restoring up to 15 energy with a shared five-second drinking cooldown; drinking does not heal HP. Barrels use the same inventory window and transfer rules as chests. Approach within 28 world units of their solid footprint and press E to inspect, take individual items or **Забрать всё**, or put carried items back. Their authored initial supplies are one wood and one fiber, created once per world session; opening, returning to the location and changing character identities never replenish them. A hit spills only the remaining contents. Barrel art and collision remain in place when empty. Bodies use the shared window too, but accept no deposits. Range, life, action locks and line of sight are validated by the server.

Action-result notifications disappear after five seconds. Each new adventure or party result has a server receipt, so repeated snapshots never extend the toast and a new action with the same wording can still show it again. Quest, inventory and party state remain available in their windows.

Materials are ordinary backpack item instances: herbs and grain stack to nine per slot; wood, stone, fiber, scrap and saplings occupy one slot per unit. The backpack holds 50 occupied slots, including equipment carried in the bag, food, hearts and material stacks. Gathering and harvesting check the entire carried result fits before spending energy or depleting the source. A full bag still permits container inspection; bulk transfers take only the items that fit and leave the rest inside. Crafting consumes real carried material quantities and checks the finished item fits after ingredient consumption. Crafting summaries are derived from backpack contents, not a separate wallet. Chest, barrel, ground, theft and backpack transfers preserve whole-stack quantities and item condition. E performs a selected target’s sole action directly; its multiple actions use a vertical menu. Dialogue choices are vertical; **Покажи товары** opens a separate shop view, with a button or Escape returning to the conversation.

Trees and tall props are complete cached sprites sorted by their ground contact Y; grass and paving remain below them. Generated clearing boundaries remove complete obstructing props rather than cutting individual tiles. Furniture footprints, visible composites and collision data are authored together.

## Theft and practical stealth

C enables sneaking. Approach a living NPC or player within 28 world units, then use E and choose **Попытаться украсть**. The server validates reach, line of sight, action readiness, 10 energy and capacity. Each paid attempt has an 8-second cooldown; retrying the same target requires 60 seconds. Empty pockets and invalid attempts give no practice. The theft action takes one existing, unequipped item or whole material stack from the victim's inventory; equipped items are not pickpocketed. Stack limits and receiving capacity are checked before the transfer. Named residents start with finite authored pocket contents, independent of shop offers. Nothing is generated on demand by stealing.

An undetected success transfers the same item instance atomically. It grants 70 base Shadow XP. Failed attempts grant no XP; standing with C enabled or retrying rejected commands does not. The target's facing and learned stars affect the roll, with a remaining risk. An undetected failure or success sends no accusation to the victim. Normal character snapshots reveal only the viewer's own bag and exact mastery experience. Other characters' equipment and attained constellation levels remain visible; hidden experience does not reveal an unnoticed attempt.

On detection, combat-capable NPCs defend themselves and noncombatants flee and can call the city guard. A human-controlled victim retains control and receives a private warning. **Позвать стражу** is available for 30 seconds after a witnessed attempt. It requests a temporary response; arbitrary accusations are rejected. Retaliation uses ordinary movement and combat and is limited to the actual participants. Pursuit remembers the last-known point when sight is lost.

A witnessed theft also provides five minutes to file **Пожаловаться на …** via E near a living city guard, within 64 world units and line of sight. Calling for immediate help does not consume this evidence. The formal complaint enters the offender's current identity in Novogorod's blacklist. Leaving the location or disconnecting does not clear the record: city guards attack on encountering the offender, and both city merchants refuse purchases, including through an already open shop. The blacklist has no automatic 30-second expiry. These consequences currently apply to Novogorod; there is no general reputation, fine collection or jail system.

Approach **Сестра Вера** in the chapel and choose **Отпустить грехи · 30 золотых**. The shared server rule validates the living cleric, reach, line of sight, action readiness, blacklist and balance before one atomic payment. It clears the city record, outstanding old evidence and related pursuit/retaliation; replaying the command does not charge again. An old complaint cannot immediately restore a forgiven record. Quest rewards remain available to earn the fee while merchants refuse trade. Resurrection preserves the same identity and its record; permanent death ends that identity and a new character begins clean. All records are currently in server memory, so a server restart starts a new world session.

Stealth also practices through actual unseen movement near an observer: at least 64 world units across four new cells, with a four-second award interval and a minute before repeated ground counts again. Safe crouching, movement into a wall, following one's own companion or pacing beside allied human players does not train it. Stealth stars reduce sight detection and noise; mastery levels do not directly change them. Successful theft and validated stealth movement award the shared Shadow mastery, using Fibonacci thresholds and constellation conflict. Permanent death resets the identity.

Positive authoritative damage events trigger a short recoil pose, a red flash and a rising damage number. These are visual feedback only; death takes presentation priority and misses do not show a hit. Building facades sort at their front ground line, so characters standing in front remain visible while characters inside the footprint stay behind the cover until entering.

## Routes, markers and scenarios

Click empty ground to replace the current walking route. **Shift+click** appends
another numbered destination, up to 32. Each marker disappears only after actual
server-confirmed arrival; remaining numbers stay stable. A destination that cannot
be reached for ten seconds is skipped with a notice. These temporary routes are
separate from the pathfinder's intermediate cells.

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

Open **Спутники** near city residents. The panel shows their nature, actual control source, speech capability, personality, current agreement and last reply. You make requests within 64 world units; characters may refuse. The princess can travel after an introduction and refuses combat. The veteran can accompany and fight. The guard protects his post and declines travel. Speech does not require movement or combat, and talking does not force someone to follow.

The running personalities use local authored rules. The UI reports **Сценарий** and **Эхо** for that controller. It reports **Модель** and **Искра** only when an external agent has supplied an accepted intention; the lease lasts five seconds. Expiry or an explicit wait returns the actor to its scripted scenario as an Эхо without changing its identity or inventory. This is not a built-in paid language-model service.

Existing worker, artisan, guard, companion and hostile strategies enter the common scheduler as bounded server-owned policy tasks. Their retained controllers still choose the next ordinary intention; their profession logic is not yet an editable data-only scenario. The two new wanderers and player-assigned jobs use the semantic scenario steps directly. A running or paused assigned scenario, active conversation or exclusive control prevents the baseline policy from acting concurrently.

Прохор and Дарья wander through city street routes using the shared scenario runner. Прохор accepts noncombat work after an introduction; Дарья requires completion of Мира’s hearts-for-the-bell quest. Willingness is authored as typed conditions (`always`, `never`, `met`, `quest_completed`, `all`, `any`), and existing promises, reach, line of sight and availability are checked on assignment. Echo does not mean a player can commandeer it.

A successful conversation stops an NPC and suspends its current scenario step while at least one valid nearby viewer is talking. Closing the last conversation resumes the step. Lost reach or sight, travel, death, disconnect and urgent threats end the corresponding conversation holds. The **Спутники** talk action uses the same dialogue session as E.

## External agent MCP

The optional native stdio MCP server controls eligible NPCs through the same authoritative intentions. It does not edit their coordinates, HP or inventory. Start the backend with a `GAME_AGENT_TOKEN`, then launch the MCP process with the same token:

```sh
GAME_AGENT_URL=http://127.0.0.1:3000 GAME_AGENT_TOKEN=your-local-token-at-least-24-characters bun scripts/agent-mcp.mjs
```

The tools are `ratata_observe` (optional `locationId`) and `ratata_act` (`actorId` and a `decision`: `move`, `move_to`, `movement_mode`, `dash`, `attack`, `open_chest`, `take_chest_item`, `take_all_chest_items`, `take_chest_gold`, `put_chest_item`, `close_chest`, `steal`, `call_guards`, `report_theft`, `absolve`, `speak` or `wait`). The URL must be local and the matching token must contain at least 24 characters. Without a backend token the HTTP agent routes are disabled. Chest commands use the same shared rules; their agent action result includes only that controlled NPC’s validated `chest` view, while the global observation response does not expose container contents. The model control lease lasts 5 seconds, then the scripted controller resumes; `wait` releases it immediately. This bridge does not require or modify global Codex configuration. Browser `window.__ratataTest` remains the independent player-testing interface.

## Hotbar, target focus and combat feedback

The four 48px action slots reset for each new character identity. Slot 1 starts with basic melee attack for every background. Slot 2 starts with Shot for Ranger, Spark for Arcanist or Prayer for Cleric; Vanguard leaves it empty. Slots 3–4 start empty. Use Shift+1–4 to choose basic attack, a known ability, an apple, or clear a slot. One press acts immediately. A second press within 300 ms enables server repetition without an extra immediate cast; another press stops it. Held keys do not repeat. Only one slot repeats at a time, even if the same ability is bound twice. A food double press consumes one apple and never enables repetition. The active slot has an outline and ↻ marker, plus written status showing whether the server is approaching, casting, or waiting for cooldowns or resources. Switching repetition off prevents future applications; an already-started cast follows the normal interruption rules. Each prayer repeats its selected spell, original target and intent, stops after healing or resurrection is complete, and never switches to an unrelated ally or farms practice through plain devotion. Apples bind by item type, consume a real inventory instance and retain their icon at zero quantity. Cooldowns and resource requirements are checked again by the server. A bound prayer shows its exact target, cost and possible allied/self victims before pressing its key; its harmful 48px wave is outlined in the world, with warning markers on visible affected allies and yourself.

Without a selected target, Shot and Spark fire in the facing direction. Spark uses its own 80×32 pixel corridor, normal windup/cooldown and 6 mana plus 5 energy. The server picks the nearest permitted character or grave in that corridor and checks obstacles. An empty cast still costs resources and shows the effect but grants no practice. The world guide and cast effect use that same geometry; basic melee attack remains independent of Spark.

Each assigned slot also has an **×** button labeled **Очистить слот N**, reachable with Tab and activated with Enter or Space. Clearing removes only that slot's binding, keeps every item in the inventory and returns keyboard focus to the now-empty slot.

In the inventory, focus an apple's slot and press Shift+1–4 to bind it directly; Enter is not required. After selecting the apple with Enter or a click, the same shortcuts and numbered assignment buttons also work. The inventory stays open and keeps keyboard focus; assigning a slot does not eat the apple. Close the inventory with Esc, then press the slot's number to eat it.

Use arrows to move between inventory cells and Enter or E to open and confirm item actions. When equipping, consuming or transferring removes the selected item from the bag, keyboard focus returns to the same cell, even if it becomes empty. Continue with the arrows without reopening the inventory. A rejected action keeps its current menu and focus.

T cycles visible hostile targets; Shift+T cycles allies and recoverable bodies; F selects yourself. Changing the selected target cancels automatic action repetition. E opens the selected reachable target's actions, or uses the facing interaction when there is no selected target. Any friendly reachable character offers **Следовать**. Friendly targets use a circle and shield, hostile targets a diamond and crossed swords; objects retain gold corners. Manual movement, stun, death, window focus loss and Esc cancel automatic control. Follow can continue across adjacent locations using ordinary movement. Menus consume gameplay keys and release held movement.

The party panel puts the crowned leader first, shows names and health with a thin bar without numeric text, and marks distant, offline or fallen members. Incoming invitations offer acceptance/refusal; pending invitations cannot be sent back to their sender.

Arrows and blue-violet sparks use the ability's server windup and selected target. Prayers show distinct Hearth flame, Road wind, Lantern constellation and Grave broken-ring motifs. Healing labels name HP, energy or mana; resurrection has a three-second casting arc and rising completion mark. Only confirmed damage or absorption creates a harmful wave and victim flares. Barriers have facets and crumble when their authoritative state ends. Stun displays **СТАН 0.9** from authoritative remaining time.

Cached Canvas graphics and bounded Excalibur ParticleEmitter bursts share a conservative 32-view scene budget: eight damage reactions, twelve transient spell/status effects, six barriers and six stun labels. Particle reservations never exceed 192. Scene changes and disposal clear effects; reduced motion preserves readable labels and stationary marks while suppressing travel, expansion, shake and particles.

Melee and skeleton strike arcs begin at the same world anchor as the attacker's hit zones, without the torso offset used by spell effects. They point toward the authoritative target, falling back to facing for an untargeted swing. Their initial position and heading stay fixed for that swing; reduced motion keeps the same direction. The curved swing remains ordinary combat feedback. Yellow hit rectangles, directional Shot/Spark corridors and harmful prayer geometry appear only to a living connected observer inside a map-authored training yard, clipped to its interior. Leaving, dying, disconnecting or changing maps clears them.

Novogorod's wooden training pen is east of the square, before the smithy (outer tiles x57–71, y43–56, three-tile entrance on the west). Its stationary wood-and-straw construct uses shared character combat: select it with a click or T and use ordinary attacks or auto-attacks. Hits measure calculated damage without reducing HP, stunning, granting practice or generating rewards; weapon durability, energy and mana costs still apply. Prayers do not damage wood. Attacks from outside use the same reach and line-of-sight checks, but do not grant the yard's numeric feedback.

Combat feedback uses server-assigned grey «Промах»/«Слабый удар», light yellow «Удар», orange «Добротный удар» and red «Критический удар». Criticals take priority over weakened energy and raw-roll thirds. Exact damage on the dummy is visible from inside its yard; other combat hides amounts. Protocol 0.6.0 sends HP/MP/EN as rounded-down integer percentages without current or maximum amounts unless the observer has the server-only `exactCombatNumbers` capability. This applies to the observer's own character too. Hidden healing, absorption, barrier reserves and recovery notices do not reveal amounts. Private `resourceChecks` tell the acting identity whether an action has enough resources; commands still revalidate their actual costs. Zero-capacity resources are distinguished from empty refillable bars. Private character sheets show approximate bands; Life and Magic stars independently earn precise self-resource knowledge. Raw combat stats and hidden graph state are not sent to other observers. The local character's overhead HP bar stays hidden.

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

`bun run test:e2e` starts a fresh app-test world on backend/frontend ports 3500/5500, then runs desktop and mobile grave scenarios in separate fresh processes on 3501/5501, followed by Storybook checks. Existing servers are not reused. `E2E_BACKEND_PORT` and `E2E_FRONTEND_PORT` change the app pair; grave scenarios use the next ports. Grave artifacts and reports are retained separately as `graves-desktop` and `graves-mobile`, so disconnected actors, earlier deaths and encounter age from one viewport cannot alter the other. Run either grave viewport alone with `bun run --cwd apps/frontend test:e2e:graves:desktop` or `test:e2e:graves:mobile`. All gameplay actions use ordinary validated commands; long ritual scenarios wait for the real server deadline.

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

## Independent prayer schools

Clerics start only with Hearth Prayer. Sister Vera can teach the four separate spells to any background through ordinary nearby interaction: Prayer (`pray`), Prayer of the Wanderer (`pray_road`), Prayer of Clarity (`pray_lantern`) and Prayer of Ash (`pray_grave`). Bind them independently using Shift+1–4. Each uses its own god, Faith and Miracles; changing the primary patron affects the affiliation shown under the resource bars, never a spell’s effect or knowledge. The three new paths currently have their base spells, with an additional undead resurrection node for Ash. Healing passives and grave purification belong only to the original Prayer constellation. Resurrection is still a mode of the matching prayer, without a separate hotbar binding.

Character Development has nine constellations on a personal, stable star map centered on the initial class. Unknown cards say only «Неизвестно», and their grey translucent stars cannot be selected or focused. Known cards contain their effect instead of training instructions. See [character development](character-development.md) for school practice, resource recovery and the training-yard radius selection.

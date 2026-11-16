# My Game Ratata: Game Concept

## What We Are Building

My Game Ratata is a new top-down fantasy RPG built from scratch. The older
`my-ai-world-dragonat` project is used only as product and technical context:
no gameplay code, assets, maps, or implementation details are copied into this
repository.

The intended result is a playable client/server RPG prototype where players
move through a 2D world from a top-down camera, interact with NPCs and hostile
creatures, fight in real time, and eventually participate in a deeper world
simulation with character memory, reputation, AI-driven behavior, and shared
domain contracts between frontend and backend.

## Product Direction

The game should feel like a living pixel-art fantasy world rather than a static
combat demo. The first milestones should prioritize a small but coherent loop:

- a player can join the world, move, and see their character on a map;
- the backend is authoritative for gameplay-critical state;
- the frontend renders a responsive top-down scene and HUD;
- NPCs and hostile creatures can exist in the same world model as players;
- combat, health, energy, mana, stun, attack zones, respawn, and chat-like
  messaging are treated as domain systems, not one-off UI behaviors;
- shared contracts define network and gameplay state so frontend and backend
  cannot silently drift apart.

## Technical Direction

The old prototype points to several useful ideas:

- TypeScript everywhere, with strict checking from the beginning.
- A Bun-powered backend for fast local iteration and server runtime.
- A Vue + Vite frontend shell, with Pinia for state, Vitest for unit tests,
  Playwright for e2e tests, ESLint, Prettier, and Vue DevTools.
- A root `contracts` package for shared TypeScript types and protocol shapes.
- A top-down 2D rendering layer can later use a game engine such as Excalibur,
  or another dedicated renderer, inside the frontend app.
- Maps can be authored externally, for example with Tiled, then loaded by the
  game client and interpreted by the backend for collision and pathfinding.
- WebSocket-style realtime transport is the likely fit once gameplay state
  moves beyond health checks.

## Architecture Principles

The backend should be the source of truth for positions, combat results,
inventory, status effects, NPC decisions, and world simulation. Clients should
send intents such as movement, interaction, attack, or ability requests; the
server validates and applies those intents, then publishes snapshots or events.

Characters should not be modeled as separate unrelated classes for players,
network players, NPCs, and scripted actors. They should share one domain model,
with different controllers producing intents:

- local player input;
- remote player network commands;
- NPC AI;
- scripted quest or director logic;
- tests and replay tools.

This keeps combat, effects, resources, pathing, and replication behavior
consistent across players and NPCs.

## Early Domain Concepts

Initial contracts and backend modules should grow around these concepts:

- `PlayerIdentity` and session/connection ownership;
- `WorldPosition`, velocity, facing, and movement intent;
- map collision and navigation/pathfinding;
- `CharacterState` for players and NPCs;
- resources such as hit points, energy, and mana;
- attack zones, cooldowns, damage, stun, death, and respawn;
- chat or speech bubbles as world events;
- NPC state, memory, aggression, flee behavior, and target selection;
- authoritative world snapshots and event streams.

The first implementation should stay small, but the structure should leave room
for richer RPG systems: abilities, effects, tags, factions, reputation, memory,
and story-driven AI.

## Current playable scope

The prototype now contains the 25-location Lands of Novogorod, with a central city and increasingly dangerous outskirts, shared combat, inventory,
gathering and crafting, a persistent-in-session quest, trading, resurrection and
permanent player death. The current story is the Ash Border: a silent memory bell
has weakened the roads between inhabited places. Residents need supplies and
protection while the player recovers three slime hearts to restore the bell.

Искра is the world's name for individual will: a resident may make promises,
reconsider a relationship and choose a new direction. Эхо is a recurring purpose
or memory attached to the world. These are character properties, independent of
human, model or scripted control. Speech is also an independent capability.
Personalities can accept or refuse companionship; a princess can travel without
fighting, a veteran can fight alongside a companion, and a guard can defend a post
without abandoning it. The implementation currently uses authored local policies
and exposes an optional agent bridge. It does not claim to run a language model
when no external model is connected.

Starting backgrounds give initial strengths, not permanent skill restrictions.
Every character uses the same knowledge tree: practice grows swordsmanship,
miracles and fire magic through successful application. Skills have ten levels;
mastering Fireball unlocks Greater Fireball. Learning and practice are distinct:
the scholar teaches the first spell, then meaningful use improves it. The UI
shows prerequisites, practice thresholds and the rising cost of mastering more
skills. See `playable-world.md` for exact controls and current costs.

## Storybook Game Gallery

The frontend includes a Storybook gallery for inspecting early game visuals in
isolation. The first gallery layer focuses on character sprite sheets rendered
through Excalibur:

- all current character sheets are visible together;
- each character can be inspected by action, direction, and frame;
- frame selection is exposed as a Storybook slider;
- animations can be played in place through Excalibur;
- left-facing variants are rendered by flipping the right-facing frames, matching
  the source sprite-sheet convention.

Only visual reference assets were copied from the old prototype. The old game
runtime, combat UI, HUD implementation, maps, and gameplay code were not ported.
Those interfaces should be rebuilt here from the new contracts and domain model,
then added to Storybook as separate stories once their own components exist.

### Тип существа

`GameCharacter.creatureType` — общий серверный тип, независимый от внешности,
класса, фракции, души и контроллера. Полный перечень: `aberration`, `beast`,
`celestial`, `construct`, `dragon`, `elemental`, `fey`, `fiend`, `giant`,
`humanoid`, `monstrosity`, `ooze`, `plant`, `undead`. Это классификация из
[D&D 5e Basic Rules, Type](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters#Type),
а игровые иммунитеты и эффекты задаются отдельно. Люди — гуманоиды, скелеты —
нежить, слизни — слизь; профиль зомби должен явно задавать нежить, независимо
от выбранного спрайта. Неизвестные типы отклоняются, клиент их не назначает.

### Классы, способности и общий бой

Класс задаёт стартовые параметры и знания, а не отдельную симуляцию или
пожизненный запрет на обучение. Игрок, спутник, жрец и скелет отправляют
намерение в общие правила: сервер проверяет жизнь, оглушение, занятость,
ресурсы, перезарядку, локацию, дальность и прямую видимость. Выбранная цель
сохраняется до попадания; потеря цели не переносит удар на соседа. Уклонение,
критический урон, барьер, оглушение и смерть разрешаются одной системой.

| Старт    | Отличия и известные способности                                                                |
| -------- | ---------------------------------------------------------------------------------------------- |
| Воин     | 30 HP, 150 энергии; ближний бой с множителем урона ×1,2.                                       |
| Следопыт | 24 HP; скорость 110; выстрел на 64 px, 4–7 урона, 10 энергии, перезарядка 550 мс.              |
| Арканист | 20 HP, 100 маны; искра на 80 px, 3–6 урона, 6 маны и 5 энергии, перезарядка 800 мс; барьер.    |
| Клирик   | 26 HP, 120 маны; обычная атака ближняя и не расходует ману; молитва и возможность воскрешения. |
| Скелет   | Костяной удар: 24 энергии, замах 600 мс, перезарядка 8 с; при попадании оглушает на 800 мс.    |

Барьер стоит 12 маны, действует 5 с, поглощает 8 урона и восстанавливается
10 с. Обычные и специальные атаки используют общую геометрию попадания;
во время замаха цель может уйти за пределы дальности или видимости.
NPC выбирают эти же способности, сохраняя согласие спутника на бой.
Скриптовый клирик использует обычную молитву и отказывается от помощи,
если её побочная волна заденет союзников или его самого.

Другой класс может изучить молитву у клирика, искру и барьер у учёного,
выстрел у ветерана. Огненный шар требует магических знаний уровня 3 и
обучения; большой огненный шар открывается при освоении обычного до уровня 10. Все навыки имеют уровни 1–10; рост уже освоенных веток увеличивает цену
дальнейшей практики. Успешное изучение не равно повторяемой практике.

### Молитвы и покровители

Четыре школы имеют фиксированных богов и независимый опыт созвездий. У Молитвы
шкала называется «Чудеса»; отдельных уровней Веры нет. Клерик начинает с Молитвой
Матери и Воскрешением. Сестра Вера бесплатно обучает четырём школам любой класс;
выбор покровителя не меняет изученные заклинания.

Молитва (`pray`) за одно применение совершает один вид чуда: лечит живых,
воскрешает павших, воздействует на нежить или очищает могилы. Ранги
Проводник → Наставник → Предводитель увеличивают лимит обеих молитв до 2/5/20 целей.
Сплетённая молитва (`pray_woven`) — отдельное активное заклинание той же школы:
сочетает разные виды чудес в пределах того же общего лимита. Она требует Кару, Воскрешение,
Знамения, Дальний голос и Проводника. Другие школы восстанавливают энергию,
ману или здоровье нежити; Прах сохраняет собственное воскрешение с 50% ресурсов.

У Матери общий трёхсекундный канал для всех чудес и воскрешения. За каждую основную
цель при старте списываются 5 MP, без возврата при прерывании. Цели, усиления и цена
фиксируются; при нехватке маны выбирается меньше получателей. Без ручной цели
приоритет: воскрешение, лечение союзника, лечение себя, нежить, могила. Подмена
утраченной цели запрещена. Для воскрешения сохраняется окно души 60 секунд.

Сосредоточение, Концентрация и Абсолютная концентрация сокращают время на
10%, ещё 20% и ещё 10%. Концентрация даёт 50% защиты от срыва HP-уроном, но не
станом; Абсолютная защищает от срыва уроном и от наложения стана. Суровый ответ
(Чудеса 6) добавляет 130% урона Кары, Гнев небес (12) — ещё 330%. Поспешная кара
вычитает 100 процентных пунктов усиления и сокращает время ещё на 5%.
Тёплый и Щедрый дары добавляют 130% и 250% лечения. Процентные усиления складываются.

Смиряющий, Сковывающий, Слепящий и Изгоняющий свет действуют на выбранную нежить
в общем лимите целей: минимальный бросок без крита, скорость 10%, сокрытие
молящегося и отступление с запретом атаки/возвращения. Фоновые ауры не занимают
цели и не требуют доплаты: Защита даёт всем живым +10 п.п. уклонения, Благословение
даёт другим членам группы преимущество на проверки успеха. Домен (Чудеса 12)
восстанавливает всем живым, включая врагов, по 1 HP на отметках 100–500 мс и
увеличивает входящий урон нежити на 50%. Полезное лечение даёт 30 XP на получателя
один раз за каст, совместно с основным лечением. После прерывания все ауры
подавлены до полного завершения следующей молитвы Матери; отказ тоже подходит.

Последний огонёк при HP ниже 20% из-за вражеских ран добавляет 1000% лечения и
сокращает время на 20%. Самолечение обязательно первым; основное лечение каждого
получателя стоит 30% эффективного максимума MP, остальные цели — по 5 MP.
Канал прекращает только смерть; затем общий откат обеих молитв 10 секунд.

Мученик — особая бесплатная звезда за пять циклов «вражеская рана → полезное
самолечение обычной Молитвой» до Чудес 3 без других осмысленных действий.
Он навсегда уменьшает базовые HP на 30% и MP на 15%, усиливая основное лечение
Матери на 15% и сокращая её канал ещё на 15%. Воскрешение сохраняет эффект;
окончательная смерть личности его снимает.

Настроение даёт 80/55/25% основного успеха. Кара имеет +20 п.п. к этому порогу,
очищение — 20% × основной шанс / 55%, предел 95%. Уровни не усиливают действия
напрямую. Преимущество бросает проверку дважды, выбирая благоприятный исход;
величины урона, добыча и случайные открытия не перебрасываются.

Пустые действия, манекены, искусственные раны и расходы самих ресурсных молитв
не дают опыта. Реальные потери ресурсов восстанавливаются с однократным учётом.

Барьер тренирует магические знания один раз при поглощении вражеского урона;
атака тренирует навык только при положительном вражеском уроне.

### Тела и конечные запасы

Герой сохраняет сумку, надетые вещи и золото в течение 60 секунд на
воскрешение. После окончательной смерти всё переносится в общий контейнер
тела до удаления личности. Обычный возрождающийся NPC оставляет такой
контейнер сразу; его прежние вещи и золото не восстанавливаются при respawn.
Контейнер живёт отдельно от персонажа, доступен для обыска как сундук и
исчезает только после опустошения либо завершения серверной сессии.
Вещи и золото забираются однократно, переполнение остаётся в теле;
складывать предметы обратно в тело нельзя.

Мобы вне боя подбирают видимую добычу обычными командами и несут реальные
предметы, которые затем переходят в их тело. Скелет оставляет настоящий
надетый меч, без дополнительной случайной копии. Сердце враждебного слизня
возобновляется по одному на каждую настоящую смерть, независимо от квеста.
Всё это — состояние мира в памяти процесса, без долговременного сохранения.

## Keyboard HUD and visual feedback

Four action slots bind basic attack, known abilities or real food items with Shift+1–4. Slot 1 starts with the background’s basic attack, ranger shot, mage spark or cleric prayer; the other slots start empty. One press executes once; a second press of that same slot within 300 ms enables server repetition without another immediate application, and pressing its active slot stops future repetitions. Held keys do nothing. A food double press consumes once and never enables repetition. Only one slot repeats, even when multiple slots share a binding. Its outline, ↻ marker and written waiting state identify the active action without relying on color. Shared cooldowns, resources, reach and line of sight govern repetitions; prayer keeps its exact original intent and stops after healing or revival is complete, while cosmetic devotion never trains skills. Target focus is shared by keyboard and pointer interaction: T hostile, Shift+T friendly/revivable, F self and E target actions. Movement, a changed target, menus, Escape, blur, death and disconnect stop repetition. Friendly characters can be followed through the same authoritative control rules. The party roster shows names, HP percentages, leader crown and absence/life state. Prayers disclose target, mana cost and collateral victims before use, with an exact 48px world preview for harmful waves. Distinct procedural deity/projectile/barrier effects consume server outcomes, remain bounded and support reduced motion.

NPC dialogue has one source of spoken text: a full, viewport-clamped speech bubble above the visible speaker. The dialogue window retains choices and trade controls. Stable authoritative speech receipts identify each new reply, while an active conversation persists and ambient speech expires. PageUp/PageDown and a shared Tab cycle connect the choices to scrollable speech; private replies stay scoped to their recipient.

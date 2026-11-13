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

### Молитва и покровители

Молитва фиксирует намерение `restore`, `revive`, `harm` или `devotion` и выбранную цель.
Если цель стала недоступной, сервер отказывает без подмены на другого
персонажа. Дальность и радиус волны — 48 px с прямой видимостью.
Обычная молитва стоит 5 маны, блокирует действие на 400 мс и имеет
перезарядку 3 с. Воскрешение требует 20 маны и непрерывных 3 с до истечения
60-секундного окна смерти; жизнь, видимость, расстояние и покровитель
проверяются всё время чтения. Клирику оно доступно сразу; другим знающим
молитву — с уровня 5 «Чудес». Успех возвращает того же персонажа с половиной
здоровья и ресурсов. Неудачная завершённая молитва расходует ману.

Если при выборе действия подходящей цели нет, доступна простая молитва
`devotion` без цели: без расхода маны, 400 мс действия и 3 с перезарядки.
Персонаж молится со знаком своего покровителя и подписью «Молитва», но
исцеление, волна, воскрешение, случайный бросок и практика не происходят.
Предпросмотр показывает «Помолиться · 0 MP · Без эффекта», без опасного радиуса.
Появившаяся после выбора цель не превращает простую молитву в чудо.
Автоматическая поддержка NPC не запускает такие молитвы без необходимости; явная
команда игрока или агента использует те же общие правила персонажа.

| Покровитель       | Восстановление          | Воскрешение           | Волна с уровня 3 «Чудес»               |
| ----------------- | ----------------------- | --------------------- | -------------------------------------- |
| Угольная Мать     | HP органических существ | Органические существа | Святой урон нежити                     |
| Безымянный Путник | Энергия всех типов      | Нет                   | Нет                                    |
| Слепой Архивариус | Мана всех типов         | Нет                   | Нет                                    |
| Хранитель Праха   | HP нежити               | Нежить                | Нечестивый урон органическим существам |

Здесь «органические» — все типы, кроме нежити и конструктов. Волна
возникает вместе с молитвой о чуде и выбирает по типу существа, поэтому способна
задеть союзника и самого жреца. Предпросмотр раскрывает этот риск; выбор
одного врага не превращает волну в одиночную атаку.

Одна молитва использует один случайный бросок для всех последствий.
Базовый шанс ответа зависит от настроения: 25%, 55% или 80%; каждый уровень
веры после первого добавляет 1,5 процентного пункта, предел — 95%.
Для вредящей волны порог на 20 пунктов выше с тем же пределом.
Настроение также меняет силу эффекта и обновляется каждые 30 с. Вера уровня
4 даёт намёк, уровня 7 раскрывает настроение и шанс, уровня 10 — время
следующей смены.

Практика начисляется за проверенный полезный результат. Вера растёт за
осмысленную попытку, чудеса — за фактическое восстановление, воскрешение
или урон настоящему противнику. Пустая молитва, лечение полного здоровья,
вред себе/союзнику и последующее лечение такого вреда не дают практику.
Барьер тренирует магические знания один раз при поглощении вражеского
урона; атака тренирует соответствующий навык только при положительном
вражеском уроне. Нейтральная цель не считается противником только из-за
отличающейся фракции.

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

Four initially empty action slots bind known abilities or real food items with Shift+1–4. Target focus is shared by keyboard and pointer interaction: T hostile, Shift+T friendly/revivable, F self, E target actions and Q automatic attack. Friendly characters can be followed through the same authoritative control rules. The party roster shows names, HP percentages, leader crown and absence/life state. Prayers disclose target, mana cost and collateral victims before use, with an exact 48px world preview for harmful waves. Distinct procedural deity/projectile/barrier effects consume server outcomes, remain bounded and support reduced motion.

NPC dialogue has one source of spoken text: a full, viewport-clamped speech bubble above the visible speaker. The dialogue window retains choices and trade controls. Stable authoritative speech receipts identify each new reply, while an active conversation persists and ambient speech expires. PageUp/PageDown and a shared Tab cycle connect the choices to scrollable speech; private replies stay scoped to their recipient.

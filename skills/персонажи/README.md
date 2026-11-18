# Навык: персонажи

Эта инструкция описывает, как добавлять управляемых персонажей в галерею игры.

## Единая логика персонажа

Любой персонаж в игре должен быть `GameCharacter`: игрок, scripted NPC, AI NPC или
комбинация контроллеров используют одну и ту же модель состояния, movement,
collision, combat, cooldowns, resources, regen, death/respawn и snapshot.

Различается только внешний контроллер:

- Искра есть только при действующем подключении человека или принятой аренде управления моделью. Сценарные NPC и отключившийся игрок — Эхо; отключение не удаляет персонажа из мира и не отменяет уже запущенный общий сценарий. Речь, вид, боевые возможности и согласие на помощь проверяются отдельно;

- игрок передает намерения через `NetworkPlayerController` и сетевые сообщения
  вроде WASD/click/attack/chat;
- NPC передает намерения через `Mob1Controller`, будущий script controller или AI
  controller;
- контроллеры не должны обходить `GameCharacter`, `advanceCharacter` и
  `attemptAttack`;
- нельзя добавлять отдельные правила атаки, расхода энергии, регена, смерти,
  path movement или collision только для игрока или только для NPC;
- различия допустимы как данные archetype/config: hp, speed, attack zones,
  sprite, resource caps/costs, perception radius, controller strategy.

Если нужна новая возможность персонажа, сначала добавь ее в общий `GameCharacter`
или общий сервис gameplay-логики, а контроллер пусть только выбирает намерение:
двигаться, идти к точке, атаковать, убегать, говорить.

## Формат спрайта игрока

Управляемый human-like персонаж должен быть PNG sprite sheet с прозрачным фоном:

- размер всего изображения: `288x480`;
- формат: RGBA PNG, non-interlaced;
- сетка: `7` колонок и `10` рядов;
- размер кадра: `48x48`;
- фон каждого кадра прозрачный;
- не запекать debug-рамки, тени сетки, подписи или номера кадров в PNG;
- левое направление не рисуется отдельно: игра зеркалит right-facing кадры.

## Формат спрайта врага

Враги human-like размера, например зомби и скелеты, используют PNG sprite sheet:

- размер всего изображения: `288x624`;
- формат: RGBA PNG, non-interlaced;
- сетка: `6` колонок и `13` рядов;
- размер кадра: `48x48`;
- фон каждого кадра прозрачный;
- левое направление также получается зеркалированием right-facing кадров.

## Ряды анимаций игрока

Ряды считаются с нуля:

- `0`: idle down;
- `1`: idle right;
- `2`: idle up;
- `3`: walk down;
- `4`: walk right;
- `5`: walk up;
- `6`: attack down;
- `7`: attack right;
- `8`: attack up;
- `9`: death.

## Ряды анимаций врага

Ряды считаются с нуля:

- `0`: idle down;
- `1`: idle right;
- `2`: idle up;
- `3`: walk down;
- `4`: walk right;
- `5`: walk up;
- `6`: attack down;
- `7`: attack right;
- `8`: attack up;
- `9`: damaged down;
- `10`: damaged right;
- `11`: damaged up;
- `12`: death.

## Количество кадров

Сохраняй совместимость с `playerAnimations`:

- idle: `4` кадра;
- walk: `6` кадров;
- attack: `4` кадра;
- death: `5` кадров.

Лишние колонки в ряду могут оставаться прозрачными, но размер sheet должен оставаться
`7x10` кадров.

## Масштаб и выравнивание

- Персонаж должен занимать примерно тот же видимый размер, что `player.png`.
- Ноги и центр тела должны оставаться выровненными между кадрами.
- Внутренний transparent padding внутри `48x48` кадра нормален: он нужен для оружия,
  атаки, смерти и стабильного anchor.
- Если нужен debug, рисуй frame bounds в Storybook, а не в самом PNG.

## Подключение нового персонажа

1. Положи PNG в `apps/frontend/public/game/assets/characters/`.
2. Добавь id в `characterIds`.
3. Добавь запись в `characterCatalog`.
4. Для playable human-like персонажа переиспользуй `playerAnimations`.
5. Для врага human-like размера переиспользуй `enemyAnimations`.
6. Проверь, что персонаж появляется в `Frame Inspector`, `All` и `All Frames`.
7. Обнови Storybook visual snapshots, если изменился overview.

## Проверки

Перед коммитом выполни:

- `file apps/frontend/public/game/assets/characters/<name>.png`;
- `bun run format`;
- `bun run type-check`;
- `bun run lint`;
- при изменении поведения или интерфейса — относящиеся к нему headless Chromium сценарии вручную, например `bun run test:e2e -- e2e/gameplay-controls.spec.ts`; полный набор не запускается для каждого коммита;
- `bun run build-storybook:frontend`.

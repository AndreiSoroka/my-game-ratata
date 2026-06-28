# Навык: персонажи

Эта инструкция описывает, как добавлять управляемых персонажей в галерею игры.

## Формат спрайта игрока

Управляемый human-like персонаж должен быть PNG sprite sheet с прозрачным фоном:

- размер всего изображения: `288x480`;
- формат: RGBA PNG, non-interlaced;
- сетка: `7` колонок и `10` рядов;
- размер кадра: `48x48`;
- фон каждого кадра прозрачный;
- не запекать debug-рамки, тени сетки, подписи или номера кадров в PNG;
- левое направление не рисуется отдельно: игра зеркалит right-facing кадры.

## Ряды анимаций

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
5. Проверь, что персонаж появляется в `Frame Inspector`, `All` и `All Frames`.
6. Обнови Storybook visual snapshots, если изменился overview.

## Проверки

Перед коммитом выполни:

- `file apps/frontend/public/game/assets/characters/<name>.png`;
- `bun run format`;
- `bun run type-check`;
- `bun run lint`;
- `bun run test:e2e`;
- `bun run build-storybook:frontend`.

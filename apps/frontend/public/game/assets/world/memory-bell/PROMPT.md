# Колокол памяти

Исходный лист `source-sheet.png` создан встроенным инструментом `image_gen`.
Семь игровых PNG получены только разрезанием сетки и уменьшением без сглаживания:
`bun scripts/prepare-memory-bell.mjs`. Исходная прозрачность сохранена.

Каждый кадр — 48×64. Общая точка опоры: (24, 60); нижние четыре строки оставлены
прозрачными. Порядок: silent, prepared, active, swing-0, swing-1, swing-2, swing-3.
Восьмая ячейка исходного листа не используется.

## Промпт image_gen

Use case: stylized-concept.
Asset type: production pixel-art sprite sheet for a small top-down medieval RPG, with genuine transparent alpha background.
Primary request: Create ONE cohesive sprite sheet for the Bell of Memory: seven aligned 48x64 game frames, presented as a clean 4-column by 2-row grid on a 1536x1024 canvas (each grid cell384x512, exactly8x intended native pixel size). Eighth cell bottom right is fully transparent/empty. Do not draw grid lines, labels, text, numbers, extra icons, background or checkerboard.
Subject: a modest bronze medieval bell suspended in a dark brown wooden freestanding frame suitable INSIDE a small chapel. Simple two upright posts and one crossbeam, compact stone footings. Single golden-bronze bell cup, black inner mouth, clapper, short rope. Frame stands on one constant bottom-centre foot anchor; entire support structure identical across all seven frames. Keep generous transparent margin, visible silhouette within a 40x60 native-pixel footprint.
Style: crisp low-resolution pixel art matching Kenney Tiny Town / Mystic Woods RPG tiles: straight block pixels, one-pixel dark outlines, muted brown/grey/ochre palette, flat three-tone shading, tiny specular highlights, orthographic view from slightly above, no antialiasing, no photorealism, no painted blur, no big bloom, no cartoon face.
Layout left-to-right row-major:
Cell1 top-left SILENT: weathered dull dark bronze bell, one small crack, still and unlit.
Cell2 PREPARED: repaired clean bronze, crack repaired, still, no magical glow.
Cell3 ACTIVE: same repaired bell still, small warm amber light details indicating awakened memory, restrained pixel glow within silhouette.
Cell4 SWING0: active bell cup tilted12degrees left around its attachment under fixed crossbeam; posts and base remain identical.
Cell5 bottom-left SWING1: active bell cup vertical midpoint.
Cell6 SWING2: active bell cup tilted12degrees right around same fixed attachment.
Cell7 SWING3: active bell cup vertical midpoint with clapper slightly opposite tocell5.
Cell8 empty transparent.
Alignment constraints: every 384x512 cell has exact same fixed support and base anchored at native point(24,60), high-res(192,480) relative to cell. Bell hangs from same point. No cell bleeds into neighbouring cell. Whole object fully visible, no shadow on ground. Intended final frames are48x64; use an8x block-pixel scale so downsampling nearest-neighbour retains a crisp sprite. Preserve genuine transparent alpha, not white or checkerboard.

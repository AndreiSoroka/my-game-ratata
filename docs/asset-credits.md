# Asset credits

## Kenney Tiny Town

The Novogorod buildings, market stalls, walls, gates, garden details and suburban houses use **Tiny Town 1.1**, created and distributed by **Kenney**.

- Official source: https://kenney.nl/assets/tiny-town
- License: [Creative Commons Zero 1.0 (CC0)](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded: 2026-11-06
- Original packed 16×16 atlas: `apps/frontend/public/game/map/assets/KenneyTinyTown/tilemap_packed.png`
- Original pack license: `apps/frontend/public/game/map/assets/KenneyTinyTown/License.txt`
- Source record: `apps/frontend/public/game/map/assets/KenneyTinyTown/SOURCE.txt`

The atlas is copied unchanged. Attribution is appreciated by Kenney but is not required by CC0. The game composes the original tiles into deterministic maps. Novogorod buildings have walkable open doors, furnished interiors and a separate roof/facade cover layer that the client hides while the player is inside. Perimeter walls and furniture use the same collision grid as other map geometry.

## Kenney Tiny Farm

The four farms in Novogorod's cardinal outskirts use **Tiny Farm 1.0**, created and distributed by **Kenney**: green-roofed barns, decorative wheat, produce crates, hay and troughs.

- Official source: https://kenney.nl/assets/tiny-farm
- License: [Creative Commons Zero 1.0 (CC0)](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded: 2026-11-06
- Original packed 16×16 atlas: `apps/frontend/public/game/map/assets/KenneyTinyFarm/tilemap_packed.png`
- Original license and source record are preserved alongside the atlas as `License.txt` and `SOURCE.txt`.

The packed atlas is copied unchanged. The twelve active wheat beds have stable shared definitions in `contracts/src/farms.ts`; their crop state is server-owned rather than baked into the map artwork.

## Existing artwork

The restored project already contains Mystic Woods environment and character artwork. This change retains those files and uses the existing Mystic Woods grass, complete trees and furniture, wooden floor, and connected wooden fence posts. Kenney's CC0 license applies only to the added Tiny Town assets; it does not replace the terms of the existing asset packs.

## Map generation

Run `node scripts/generate-world.mjs` from the repository root. The generator reads the shared 25-location definitions from `contracts/src/world.ts`, uses fixed seeds and writes the 96×80-tile maps under `apps/frontend/public/game/map/`. `map1.json` is an exact alias of the central `map-2-2.json`.

## Kenney Impact Sounds

Grass, concrete and wood footsteps use nine unchanged clips (three per material) from **Impact Sounds 1.0** by Kenney under CC0. Source: https://kenney.nl/assets/impact-sounds (downloaded 2026-11-06). The original `License.txt` and `SOURCE.txt` are preserved in `apps/frontend/public/game/assets/audio/kenney-impact/` alongside the OGG files. The old generic movement clip remains an unused restored asset; the new surface mixer chooses the material under each character.

## Project-authored ground tiles

The flat paving, transparent soil-bed strips and dark doorway threshold are small vector tiles authored in `scripts/generate-ground.mjs`. Their SVG sources are saved under `apps/frontend/public/game/map/assets/Novogorod/`. They replace the raised-rock paving and opaque light-grass rectangles; they are not modified Kenney atlas images. The original Kenney and Mystic Woods source images remain unchanged.

- `game/assets/items/{slime-heart,bone,herbs,fiber,scrap,wood,grain,wheat_seed}.svg`: original 16×16 pixel-style SVG icons authored for this project (quest heart, seeds and material inventory items).

## Project-authored combat and interface visuals

The 2026-11-13 party panel and action slots use original CSS and SVG/text symbols. Food uses the existing item catalog artwork. Arrow, blue-violet spark, flame, wind, constellation, broken-ring, casting-arc and faceted-barrier effects are original cached Canvas drawings in `apps/frontend/src/game/runtime/effectGraphics.ts` and `prayerGraphics.ts`. Bounded Excalibur ParticleEmitter bursts provide embers, motes and barrier shards. No third-party spell bitmap or generated sprite sheet was added. Existing character and item licenses are unchanged. Storybook previews show the same draw functions against grass, light stone and dark-room surfaces.

Ordinary and skeleton melee arcs are also project-authored Canvas geometry. Their neutral shape points right and each rendered effect rotates toward its attack direction; the focused melee stories show all four directions.

Ivory speech bubbles, their pixel borders and tails are project-authored CSS. They reuse the existing Pixelify Sans headings and system text; no dialogue bitmap or external asset was added.

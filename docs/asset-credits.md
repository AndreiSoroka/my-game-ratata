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

## 0x72 DungeonTileset II

The generated dungeons use the original floor, masonry and stair tiles from **16x16 DungeonTileset II v1.7** by **0x72**. The original atlases and their source record live in `apps/frontend/public/game/map/assets/0x72Dungeon/`. The author releases the artwork under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). [Official itch.io download](https://0x72.itch.io/dungeontileset-ii)

The three above-ground tower designs and both wall-torch sprites are original pixel-style SVG artwork drawn for «Ратата». The two stair sprites used between floors are original pixel art in `assets/Novogorod/dungeon-stairs.png`. Their tile definitions live alongside the other Novogorod tilesets.

The Fat Zombie uses the pack's `big_zombie` idle and run art for its side view. The front and back views, shove, recoil and death frames were drawn for «Ратата» with the original palette and green flame. The adapted sheet lives in `apps/frontend/public/game/assets/characters/fat_zombie.png`.

## Existing artwork

The restored project already contains Mystic Woods environment and character artwork. This change retains those files and uses the existing Mystic Woods grass, complete trees and furniture, wooden floor, and connected wooden fence posts. Kenney's CC0 license applies only to the added Tiny Town assets; it does not replace the terms of the existing asset packs.

The start screen credits [Mystic Woods by Game Endeavor](https://game-endeavor.itch.io/mystic-woods) with a transparent cutout from the [original title banner](https://img.itch.zone/aW1nLzc2OTY0NTMucG5n/original/RUderv.png) and credits [Kenney](https://kenney.nl/) with the unchanged Yellow badge from [Kenney Badges](https://kenney.nl/badges).

The repository link uses the white Invertocat from the [GitHub Brand Toolkit](https://brand.github.com/foundations/logo).

## Map generation

Run `node scripts/generate-world.mjs` from the repository root. The generator reads the shared 25-location definitions from `contracts/src/world.ts`, uses fixed seeds and writes the 96×80-tile maps under `apps/frontend/public/game/map/`. `map1.json` is an exact alias of the central `map-2-2.json`.

## Kenney Impact Sounds

Grass, concrete and wood footsteps use nine unchanged clips (three per material) from **Impact Sounds 1.0** by Kenney under CC0. Source: https://kenney.nl/assets/impact-sounds (downloaded 2026-11-06). The original `License.txt` and `SOURCE.txt` are preserved in `apps/frontend/public/game/assets/audio/kenney-impact/` alongside the OGG files. The old generic movement clip remains an unused restored asset; the new surface mixer chooses the material under each character.

## Kenney Interface Sounds and Music Jingles

Menu closing, selection, clicks and reward confirmations use four original clips from **Interface Sounds 1.0**. Mastery level increases use `jingles_PIZZI04.ogg` from **Music Jingles 1.0**. Both Kenney packs use [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original licenses and source records accompany the clips in `apps/frontend/public/game/assets/audio/kenney-interface/` and `apps/frontend/public/game/assets/audio/kenney-jingles/`. [Interface Sounds](https://kenney.nl/assets/interface-sounds) · [Music Jingles](https://kenney.nl/assets/music-jingles)

## Kenney RPG Audio

Opening menus and game windows uses `bookPlace1.ogg`, a short, low thump from **RPG Audio 1.0**. The character window closes with `bookClose.ogg`. All 51 individual effects from the download are included unchanged in `apps/frontend/public/game/assets/audio/kenney-rpg-audio/`, alongside the original CC0 license and archive checksum. [RPG Audio](https://kenney.nl/assets/rpg-audio)

## Kenney UI Audio

Moving between inventory cells and selecting an item use `rollover2.ogg`. Successful changes to equipment use `switch11.ogg`. The two clips from **UI Audio 1.0** are unchanged and stored with their original CC0 license in `apps/frontend/public/game/assets/audio/kenney-ui-audio/`. [UI Audio](https://kenney.nl/assets/ui-audio)

## Portal and forest ambience

`portal-hum.wav` is an original synthesized loop with three soft pulses across 4.5 seconds. The three forest clips use public Freesound previews released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They were trimmed, filtered, given short fades and encoded as mono MP3s. All four files live in `apps/frontend/public/game/assets/audio/ambience/`.

- `forest-bird-1.mp3` uses the first 2.48 seconds of [Turdus_merula_06.wav by tinga](https://freesound.org/people/tinga/sounds/189526/).
- `forest-bird-2.mp3` uses the first 2.25 seconds of [Turdus_merula_19.wav by tinga](https://freesound.org/people/tinga/sounds/189549/).
- `forest-wind.mp3` uses the gust from 40.5 to 46.5 seconds with a 0.6-second fade in and a one-second fade out. [Forest, close up of trees rustling in the wind.wav by Anya_Media](https://freesound.org/people/Anya_Media/sounds/523389/)

## Casting voices and shore ambience

The casting and shore clips in `apps/frontend/public/game/assets/audio/ambience/` use public Freesound previews released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The two voices are filtered mono MP3s with short fades. The shore clip is a mono PCM WAV loop.

- `magic-cast.mp3` uses the passage from 2.97 to 3.93 seconds with two quiet echo taps. The game loops it during portal and chains casts. [Whisper.wav by PlumForestPodcast](https://freesound.org/people/PlumForestPodcast/sounds/517868/)
- `spark-flight.mp3` uses the passage from 0.22 to 0.42 seconds, with raised gain and short fades to fit the Spark flight. [089_bzz_t3.wav by freesound](https://freesound.org/people/freesound/sounds/50277/)
- `prayer-whisper.mp3` uses the quieter passage from 31.04 to 33.46 seconds with the high frequencies softened. [gibberish mumbling and whispering.aif by frosthardr](https://freesound.org/people/frosthardr/sounds/346638/)
- `water-shore.wav` uses the passage from 23.7 to 33.1 seconds. A 1.4-second overlap produces the eight-second loop. [200906 Water waves lapping, lake, gentle, close, PEC 9am.flac by TRP](https://freesound.org/people/TRP/sounds/568819/)

## Human death voice

`human-death.mp3` uses the passage from 0.34 to 1.16 seconds under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), filtered and encoded as a mono MP3 with short fades. [Hero Dying 1](https://freesound.org/people/vox_artist/sounds/512160/)

## Project-authored ground tiles

The flat paving, transparent soil-bed strips and dark doorway threshold are small vector tiles authored in `scripts/generate-ground.mjs`. Their SVG sources are saved under `apps/frontend/public/game/map/assets/Novogorod/`. They replace the raised-rock paving and opaque light-grass rectangles; they are not modified Kenney atlas images. The original Kenney and Mystic Woods source images remain unchanged.

- `game/assets/items/{slime-heart,bone,herbs,fiber,scrap,wood,grain,wheat_seed}.svg`: original 16×16 pixel-style SVG icons authored for this project (quest heart, seeds and material inventory items).
- `game/assets/items/{torch,lantern}.svg`: original 16×16 pixel-style icons for portable lights.

## Project-authored combat and interface visuals

The 2026-11-13 party panel and action slots use original CSS and SVG/text symbols. Food uses the existing item catalog artwork. Arrow, blue-violet spark, flame, wind, constellation, broken-ring, casting-arc and faceted-barrier effects are original cached Canvas drawings in `apps/frontend/src/game/runtime/effectGraphics.ts` and `prayerGraphics.ts`. Bounded Excalibur ParticleEmitter bursts provide embers, motes and barrier shards. No third-party spell bitmap or generated sprite sheet was added. Existing character and item licenses are unchanged. Storybook previews show the same draw functions against grass, light stone and dark-room surfaces.

Ordinary and skeleton melee arcs are also project-authored Canvas geometry. Their neutral shape points right and each rendered effect rotates toward its attack direction; the focused melee stories show all four directions.

Ivory speech bubbles, their pixel borders and tails are project-authored CSS. They reuse the existing Pixelify Sans headings and system text; no dialogue bitmap or external asset was added.

## Kenney Fantasy UI Borders

The shared buttons and the light game menu frames use **Fantasy UI Borders 1.0**, created and distributed by **Kenney**.

- Official source: https://kenney.nl/assets/fantasy-ui-borders
- License: [Creative Commons Zero 1.0 (CC0)](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded: 2026-11-19
- Canonical original PNG and vector assets: `apps/frontend/src/shared/ui/external/fantasy-ui-borders/assets/`
- Original license and project source record are preserved as `License.txt` and `SOURCE.txt` alongside the assets.

The complete pack is preserved unchanged inside the shared UI module, including its native-size and double-size PNG exports, SVG source and reference previews. Shared UI components import these local assets. The public compatibility directory `apps/frontend/public/game/map/assets/KenneyFantasyUiBorders/` preserves the existing URL for `PNG/Default/Border/panel-border-026.png` along with the original `License.txt` and a `SOURCE.txt` record.

`UiButton` composes `FantasyBorder` with a native button and the shared light palette. `MenuPanel` combines the simple outer frame `015`, stepped inner frame `014` and square-ornament button frame `026`. The frame spacing is 10 CSS pixels. Colors, gradients and press shadows are project-authored styling; the source images remain unchanged.

`UiFrame` uses outlines `014` and `015` for default dark windows and panels. Its inset, speech and parchment treatments use the original tiles from **Kenney UI Pack - Pixel Adventure 2.0**. The pack's CC0 license is recorded in `apps/frontend/public/game/map/assets/KenneyUiPackPixelAdventure/License.txt`.

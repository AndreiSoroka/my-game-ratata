import { type ItemId, prayerActionIds } from '@my-game-ratata/contracts'
import { type DefaultLoader, ImageFiltering, ImageSource, Sound, SpriteSheet } from 'excalibur'

import {
    characterCatalog,
    type CharacterDefinition,
    type CharacterId,
} from '../assets/characterCatalog'
import { itemAssetCatalog } from '../assets/itemCatalog'
import { prayerAreaSources } from '../assets/prayerAreaAssets'
import { type GameSoundId, gameSoundIds, soundCatalog } from '../assets/soundCatalog'
import type { BellImages } from './bellViews'
import { EngineAssetLoader } from './engineRun'
import type { PrayerAreaImages } from './prayerAreaViews'

export interface CharacterResources {
    bellImages: BellImages
    chestImage: ImageSource
    farmImage: ImageSource
    fireImage: ImageSource
    itemImages: Map<ItemId, ImageSource>
    loader: DefaultLoader
    prayerAreaImages: PrayerAreaImages
    sheets: Map<CharacterId, SpriteSheet>
    sounds: Map<GameSoundId, Sound>
}

export function createCharacterResources(): CharacterResources {
    const images = new Map<CharacterId, ImageSource>()
    const itemImages = new Map<ItemId, ImageSource>()
    const sheets = new Map<CharacterId, SpriteSheet>()
    const sounds = new Map<GameSoundId, Sound>()
    const farmImage = new ImageSource('/game/map/assets/KenneyTinyFarm/tilemap_packed.png')
    const fireImage = new ImageSource('/game/assets/world/magic/fire-spells.png')
    const chestImage = new ImageSource('/game/map/assets/MysticWoods/objects/chest_01.png')
    const bellImages: BellImages = {
        states: {
            silent: new ImageSource('/game/assets/world/memory-bell/silent.png'),
            prepared: new ImageSource('/game/assets/world/memory-bell/prepared.png'),
            active: new ImageSource('/game/assets/world/memory-bell/active.png'),
        },
        swing: Array.from(
            { length: 4 },
            (_, index) =>
                new ImageSource(`/game/assets/world/memory-bell/swing-${String(index)}.png`)
        ),
    }
    const prayerAreaImages = new Map(
        prayerActionIds.map((id) => [
            id,
            new ImageSource(prayerAreaSources[id], { filtering: ImageFiltering.Pixel }),
        ])
    )

    for (const definition of Object.values(characterCatalog)) {
        const image = new ImageSource(definition.src)
        images.set(definition.id, image)
        sheets.set(definition.id, createSheet(definition, image))
    }

    for (const definition of Object.values(itemAssetCatalog)) {
        itemImages.set(definition.id, new ImageSource(definition.src))
    }

    for (const id of gameSoundIds) {
        const definition = soundCatalog[id]
        const sound = new Sound(definition.src)
        sound.volume = definition.volume
        sounds.set(id, sound)
    }

    return {
        bellImages,
        chestImage,
        farmImage,
        fireImage,
        itemImages,
        loader: new EngineAssetLoader({
            loadables: [
                ...images.values(),
                ...itemImages.values(),
                chestImage,
                farmImage,
                fireImage,
                ...Object.values(bellImages.states),
                ...bellImages.swing,
                ...prayerAreaImages.values(),
                ...sounds.values(),
            ],
        }),
        prayerAreaImages,
        sheets,
        sounds,
    }
}

function createSheet(definition: CharacterDefinition, image: ImageSource): SpriteSheet {
    return SpriteSheet.fromImageSource({
        grid: {
            columns: definition.columns,
            rows: definition.rows,
            spriteHeight: definition.spriteHeight,
            spriteWidth: definition.spriteWidth,
        },
        image,
    })
}

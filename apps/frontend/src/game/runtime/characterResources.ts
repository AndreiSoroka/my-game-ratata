import type { ItemId } from '@my-game-ratata/contracts'
import { ImageSource, Loader, Sound, SpriteSheet } from 'excalibur'

import {
    characterCatalog,
    type CharacterDefinition,
    type CharacterId,
} from '../assets/characterCatalog'
import { itemAssetCatalog } from '../assets/itemCatalog'
import { type GameSoundId, gameSoundIds, musicCatalog, soundCatalog } from '../assets/soundCatalog'

export interface CharacterResources {
    chestImage: ImageSource
    farmImage: ImageSource
    itemImages: Map<ItemId, ImageSource>
    loader: Loader
    music: {
        adventureBegins: Sound
    }
    sheets: Map<CharacterId, SpriteSheet>
    sounds: Map<GameSoundId, Sound>
}

export function createCharacterResources(): CharacterResources {
    const images = new Map<CharacterId, ImageSource>()
    const itemImages = new Map<ItemId, ImageSource>()
    const sheets = new Map<CharacterId, SpriteSheet>()
    const sounds = new Map<GameSoundId, Sound>()
    const farmImage = new ImageSource('/game/map/assets/KenneyTinyFarm/tilemap_packed.png')
    const chestImage = new ImageSource('/game/map/assets/MysticWoods/objects/chest_01.png')
    const music = {
        adventureBegins: createMusic(),
    }

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
        chestImage,
        farmImage,
        itemImages,
        loader: new Loader([
            ...images.values(),
            ...itemImages.values(),
            chestImage,
            farmImage,
            ...sounds.values(),
            music.adventureBegins,
        ]),
        music,
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

function createMusic(): Sound {
    const music = new Sound(musicCatalog.adventureBegins.src)
    music.loop = musicCatalog.adventureBegins.loop
    music.volume = musicCatalog.adventureBegins.volume

    return music
}

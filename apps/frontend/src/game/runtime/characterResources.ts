import { ImageSource, Loader, SpriteSheet } from 'excalibur'

import {
    characterCatalog,
    type CharacterDefinition,
    type CharacterId,
} from '../assets/characterCatalog'

export interface CharacterResources {
    loader: Loader
    sheets: Map<CharacterId, SpriteSheet>
}

export function createCharacterResources(): CharacterResources {
    const images = new Map<CharacterId, ImageSource>()
    const sheets = new Map<CharacterId, SpriteSheet>()

    for (const definition of Object.values(characterCatalog)) {
        const image = new ImageSource(definition.src)
        images.set(definition.id, image)
        sheets.set(definition.id, createSheet(definition, image))
    }

    return {
        loader: new Loader([...images.values()]),
        sheets,
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

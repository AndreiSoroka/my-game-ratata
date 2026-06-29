import type { ItemId } from '@my-game-ratata/contracts'
import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

const itemAssetRoot = '/game/assets/items/16x16-rpg-item-pack'

export interface ItemAssetDefinition {
    id: ItemId
    label: string
    src: string
}

export const itemAssetCatalog: Record<ItemId, ItemAssetDefinition> = {
    boots: itemAsset('boots', 'Item__48.png'),
    food: itemAsset('food', 'Item__64.png'),
    old_sword: itemAsset('old_sword', 'Item__02.png'),
    simple_sword: itemAsset('simple_sword', 'Item__00.png'),
}

export const itemAssetList = Object.values(itemAssetCatalog)

function itemAsset(id: ItemId, fileName: string): ItemAssetDefinition {
    return {
        id,
        label: ITEM_DEFINITIONS[id].name,
        src: `${itemAssetRoot}/${fileName}`,
    }
}

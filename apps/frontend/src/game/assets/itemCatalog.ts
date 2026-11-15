import type { ItemId } from '@my-game-ratata/contracts'
import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

const itemAssetRoot = '/game/assets/items/16x16-rpg-item-pack'

export interface ItemAssetDefinition {
    id: ItemId
    label: string
    src: string
}

export const itemAssetCatalog: Record<ItemId, ItemAssetDefinition> = {
    axe: nativeItemAsset('axe'),
    stone_axe: nativeItemAsset('stone_axe'),
    pickaxe: nativeItemAsset('pickaxe'),
    stone: nativeItemAsset('stone'),
    sapling: nativeItemAsset('sapling'),
    brushwood: nativeItemAsset('brushwood'),
    boots: itemAsset('boots', 'Item__48.png'),
    food: itemAsset('food', 'Item__64.png'),
    fiber: nativeItemAsset('fiber'),
    grain: nativeItemAsset('grain'),
    wheat_seed: nativeItemAsset('wheat_seed'),
    herbs: nativeItemAsset('herbs'),
    old_sword: itemAsset('old_sword', 'Item__02.png'),
    simple_sword: itemAsset('simple_sword', 'Item__00.png'),
    scrap: nativeItemAsset('scrap'),
    wood: nativeItemAsset('wood'),
    slime_heart: {
        id: 'slime_heart',
        label: ITEM_DEFINITIONS.slime_heart.name,
        src: '/game/assets/items/slime-heart.svg',
    },
}

export const itemAssetList = Object.values(itemAssetCatalog)

function itemAsset(id: ItemId, fileName: string): ItemAssetDefinition {
    return {
        id,
        label: ITEM_DEFINITIONS[id].name,
        src: `${itemAssetRoot}/${fileName}`,
    }
}

function nativeItemAsset(id: ItemId): ItemAssetDefinition {
    return { id, label: ITEM_DEFINITIONS[id].name, src: `/game/assets/items/${id}.svg` }
}

import { ABILITY_DEFINITIONS, type AbilityId } from '@my-game-ratata/contracts'

import { hotbarGlyphs, type QuickAction } from '../model/quickAction'

export function abilityExample(id: AbilityId): QuickAction {
    const { name, mana, energy } = ABILITY_DEFINITIONS[id]
    return {
        label: name,
        description: `${mana} MP · ${energy} EN`,
        icon: { kind: 'glyph', text: hotbarGlyphs[id] },
    }
}

export const basicAttackExample: QuickAction = {
    label: 'Удар ножом',
    icon: { kind: 'glyph', text: '⚔' },
}

export const foodExample: QuickAction = {
    label: 'Яблоко',
    icon: { kind: 'image', src: '/game/assets/items/16x16-rpg-item-pack/Item__64.png' },
    quantity: 3,
}

export const saplingExample: QuickAction = {
    label: 'Посадить дерево',
    icon: { kind: 'image', src: '/game/assets/items/sapling.svg' },
    quantity: 0,
}

import type { CharacterArchetype } from './index'
import type { ItemDefinition, ItemId } from './inventory'

export const TROPHY_ITEM_DEFINITIONS = {
    bone: {
        id: 'bone',
        name: 'Кость',
        maxStack: 1,
        description:
            'Забери кость из тела в течение минуты, чтобы скелет не встал. Кость подойдёт как доказательство для обращения работника.',
    },
    slime_heart: {
        id: 'slime_heart',
        name: 'Слизневое сердце',
        description:
            'Сердце враждебного слизня. Принеси три Мире для колокола памяти.',
    },
    zombie_heart: {
        id: 'zombie_heart',
        name: 'Сердце зомби',
        maxStack: 1,
        description:
            'Забери сердце из тела в течение минуты, чтобы Жирный зомби не встал.',
    },
} as const satisfies Partial<Record<ItemId, ItemDefinition>>

/** Authored trophy profiles, shared by corpse loot and workers' requests. */
export const HOSTILE_TROPHY_ITEMS: Partial<Record<CharacterArchetype, ItemId>> =
    {
        skeleton: 'bone',
        slime: 'slime_heart',
    }

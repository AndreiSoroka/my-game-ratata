import type { ItemDefinition } from './inventory'

/** World-space radius of each equipped light in pixels. */
export const PORTABLE_LIGHT_RADIUS = { torch: 64, lantern: 96 } as const
export type LightSourceKind = keyof typeof PORTABLE_LIGHT_RADIUS

export const PORTABLE_LIGHT_ITEMS = {
    torch: {
        id: 'torch',
        name: 'Факел',
        description:
            'Освещает путь в подземелье, пока закреплён в ячейке света.',
        equipmentSlots: ['light'],
        price: 3,
    },
    lantern: {
        id: 'lantern',
        name: 'Фонарь',
        description:
            'Закрепляется в ячейке света и освещает вокруг героя больше места, чем факел.',
        equipmentSlots: ['light'],
        price: 10,
    },
} as const satisfies Record<LightSourceKind, ItemDefinition>

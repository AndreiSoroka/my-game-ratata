import type { ItemId } from './inventory'

export type TreeProfile = 'forest' | 'apple' | 'pine'

export interface TreeSideDrop {
    readonly itemId: ItemId
    readonly chance: number
    readonly quantity: number
}

export interface TreeProfileDefinition {
    readonly sideDrops: readonly TreeSideDrop[]
}

/** One roll per entry after a successful wood harvest, including the final cut. */
export const TREE_PROFILES: Readonly<
    Record<TreeProfile, TreeProfileDefinition>
> = {
    forest: { sideDrops: [] },
    apple: { sideDrops: [{ itemId: 'food', chance: 0.2, quantity: 1 }] },
    pine: { sideDrops: [] },
}

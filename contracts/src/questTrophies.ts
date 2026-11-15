import type { CharacterArchetype } from './index'
import type { ItemId } from './inventory'

/** Authored trophy profiles, shared by corpse loot and workers' requests. */
export const HOSTILE_TROPHY_ITEMS: Partial<Record<CharacterArchetype, ItemId>> =
    {
        skeleton: 'bone',
        slime: 'slime_heart',
    }

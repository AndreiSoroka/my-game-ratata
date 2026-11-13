import type { ItemId } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cityResidents } from './cityResidents'
import { addInventoryItem, createItemInstance } from './inventory'

const contents: Record<string, readonly ItemId[]> = {
    ...Object.fromEntries(
        cityResidents.map((resident) => [resident.id, ['food'] as const])
    ),
    npc_friendly_girl_1: ['food'],
    npc_merchant_1: ['food', 'simple_sword'],
    npc_cleric_1: ['food'],
    npc_scholar_1: ['food'],
    npc_princess_1: ['food', 'boots'],
    npc_veteran_1: ['food', 'old_sword'],
    npc_guard_1: ['food'],
    npc_magic_slime_1: ['food'],
}
const seeded = new WeakSet<GameCharacter>()

/** Initial world content, never replenished by snapshots, respawning or another steal request. */
export function seedNpcPockets(characters: Iterable<GameCharacter>): void {
    for (const character of characters) {
        if (
            character.controllerKind === 'network_player' ||
            seeded.has(character)
        ) {
            continue
        }
        seeded.add(character)
        for (const item of contents[character.id] ?? []) {
            addInventoryItem(character.inventory, createItemInstance(item))
        }
    }
}

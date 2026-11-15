import type { ItemId, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { createItemInstance, type InventoryItemInstance } from './inventory'

export function generateChestContents(
    starter = false,
    random: () => number = Math.random
): InventoryItemInstance[] {
    if (starter) {
        return [createItemInstance('food')]
    }
    const contents: InventoryItemInstance[] = []

    maybeAddChestItem(contents, 'simple_sword', 0.9, random)
    maybeAddChestItem(contents, 'food', 0.5, random)
    maybeAddChestItem(contents, 'boots', 0.3, random)

    return contents
}

export function generateFarmSupplyContents(
    random: () => number = Math.random
): InventoryItemInstance[] {
    return random() < 0.5
        ? [createItemInstance('wheat_seed', 2 + Math.floor(random() * 3))]
        : []
}

export function dropPosition(origin: Vector2, index: number): Vector2 {
    const radius = 18
    const angle = (index % 8) * (Math.PI / 4)

    return {
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius,
    }
}

export function isPointInZones(
    point: Vector2,
    zones: GameCharacter['attackZones']
): boolean {
    return zones.some(
        (zone) =>
            point.x >= zone.minX &&
            point.x <= zone.maxX &&
            point.y >= zone.minY &&
            point.y <= zone.maxY
    )
}

export function heal(player: GameCharacter, amount: number): number {
    if (amount <= 0 || !player.alive || player.hp >= player.maxHp) {
        return 0
    }

    const before = player.hp
    player.hp = Math.min(player.maxHp, player.hp + amount)

    return Math.round(player.hp - before)
}

function maybeAddChestItem(
    contents: InventoryItemInstance[],
    itemId: ItemId,
    chance: number,
    random: () => number
): void {
    if (random() < chance) {
        contents.push(createItemInstance(itemId))
    }
}

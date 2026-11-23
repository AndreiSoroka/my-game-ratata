import type { WorldChest } from './chestInteraction'

const activeSeals = new WeakMap<WorldChest, Map<string, () => void>>()

export function watchHeartSeal(
    chest: WorldChest,
    instanceId: string,
    onBreak: () => void
): void {
    const seals = activeSeals.get(chest) ?? new Map<string, () => void>()
    seals.set(instanceId, onBreak)
    activeSeals.set(chest, seals)
}

export function breakHeartSeal(chest: WorldChest, instanceId: string): void {
    const seals = activeSeals.get(chest)
    const onBreak = seals?.get(instanceId)
    seals?.delete(instanceId)
    onBreak?.()
}

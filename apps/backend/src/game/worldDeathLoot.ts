import type {
    GameEventPayload,
    ItemId,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { createItemInstance, type InventoryItemInstance } from './inventory'

export class WorldDeathLoot {
    private readonly resolved = new WeakMap<GameCharacter, number>()

    public constructor(
        private readonly locationId: string,
        private readonly drop: (
            item: InventoryItemInstance,
            position: Vector2
        ) => void
    ) {}

    public resolve(
        events: GameEventPayload[],
        find: (id: string) => GameCharacter | undefined
    ): GameEventPayload[] {
        const result: GameEventPayload[] = []
        for (const event of events) {
            if (event.kind !== 'death' || event.targetId === undefined) {
                continue
            }
            const target = find(event.targetId)
            if (
                target === undefined ||
                target.alive ||
                target.locationId !== this.locationId ||
                target.deathSequence === 0 ||
                this.resolved.get(target) === target.deathSequence
            ) {
                continue
            }
            this.resolved.set(target, target.deathSequence)
            const itemId = deathItem(target)
            if (itemId === undefined) {
                continue
            }
            this.drop(createItemInstance(itemId), target.position)
            result.push({
                kind: 'item_drop',
                targetId: target.id,
                itemId,
                ...(event.actorId === undefined
                    ? {}
                    : { actorId: event.actorId }),
            })
        }
        return result
    }
}

function deathItem(target: GameCharacter): ItemId | undefined {
    if (
        target.archetype === 'slime' &&
        target.faction === 'monsters' &&
        target.controllerKind !== 'network_player' &&
        target.soul.controlSource !== 'human'
    ) {
        return 'slime_heart'
    }
    return target.archetype === 'skeleton' && Math.random() < 0.5
        ? 'old_sword'
        : undefined
}

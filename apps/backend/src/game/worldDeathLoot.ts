import {
    type GameEventPayload,
    HOSTILE_TROPHY_ITEMS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canAbandonLife, shouldRetireCharacter } from './characterLife'
import type { WorldChest } from './chestInteraction'
import type { CorpseWallet } from './corpseWallet'
import { createItemInstance } from './inventory'

/** Corpses outlive rendered characters; resolved receipts outlive emptied corpses. */
export class WorldDeathLoot {
    private readonly resolved = new Set<string>()

    public constructor(
        private readonly locationId: string,
        private readonly containers: Map<string, WorldChest>,
        private readonly wallet?: CorpseWallet
    ) {}

    public resolve(
        events: GameEventPayload[],
        find: (id: string) => GameCharacter | undefined
    ): GameEventPayload[] {
        return events.flatMap((event) => {
            if (event.kind !== 'death' || event.targetId === undefined) {
                return []
            }
            const target = find(event.targetId)
            return target === undefined || target.mortal
                ? []
                : this.transfer(target)
        })
    }

    /** Must run before retirement clears items and the adventure wallet. */
    public finalize(
        target: GameCharacter,
        now: number,
        abandoned = false
    ): GameEventPayload[] {
        return shouldRetireCharacter(target, now) ||
            (abandoned && canAbandonLife(target))
            ? this.transfer(target)
            : []
    }

    private transfer(target: GameCharacter): GameEventPayload[] {
        const id = `corpse:${target.id}:${String(target.deathSequence)}`
        if (
            target.alive ||
            target.locationId !== this.locationId ||
            target.deathSequence === 0 ||
            this.resolved.has(id)
        ) {
            return []
        }
        this.resolved.add(id)
        const contents = [
            ...target.inventory,
            ...Object.values(target.equipment),
        ]
        const trophy = trophyFor(target)
        if (trophy !== undefined) {
            contents.push(createItemInstance(trophy))
        }
        const gold = this.wallet?.drainGold(target.id) ?? 0
        target.inventory = []
        target.equipment = {}
        if (contents.length === 0 && gold === 0) {
            return []
        }
        this.containers.set(id, {
            id,
            kind: 'corpse',
            title: `Тело: ${target.nickname}`,
            contents,
            gold,
            opened: false,
            position: { ...target.position },
            corpse: {
                characterId: target.id,
                visualId: target.visualId,
                facing: target.facing,
            },
        })
        return [{ kind: 'item_drop', targetId: target.id, chestId: id }]
    }
}

function trophyFor(target: GameCharacter) {
    return target.faction === 'monsters' &&
        target.controllerKind !== 'network_player' &&
        target.soul.controlSource !== 'human'
        ? HOSTILE_TROPHY_ITEMS[target.archetype]
        : undefined
}

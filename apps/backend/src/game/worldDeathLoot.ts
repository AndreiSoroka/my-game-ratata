import {
    ASH_RITE_RULES,
    containerBounds,
    type GameEventPayload,
    HOSTILE_TROPHY_ITEMS,
    type Vector2,
} from '@my-game-ratata/contracts'

import { ashSummoner } from './ashSkeletonState'
import type { GameCharacter } from './character'
import { canAbandonLife, shouldRetireCharacter } from './characterLife'
import type { WorldChest } from './chestInteraction'
import type { CorpseWallet } from './corpseWallet'
import { canAwardDefeatTrophy } from './damageEvents'
import { createItemInstance } from './inventory'
import { withWorldSound } from './worldSound'

/** Corpses outlive rendered characters; resolved receipts outlive emptied corpses. */
export class WorldDeathLoot {
    private readonly resolved = new Set<string>()
    private readonly remains = new Map<string, WorldChest>()

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
        abandoned = false,
        options: { ashRemains?: boolean } = {}
    ): GameEventPayload[] {
        return shouldRetireCharacter(target, now) ||
            (abandoned && canAbandonLife(target))
            ? this.transfer(target, options.ashRemains !== false)
            : []
    }

    public seedRemains(id: string, position: Vector2): void {
        if (this.containers.has(id) || this.resolved.has(id)) {
            return
        }
        this.resolved.add(id)
        const chest: WorldChest = {
            id,
            kind: 'corpse',
            title: 'Старые кости',
            contents: [],
            opened: false,
            position: { ...position },
            corpse: { characterId: id, visualId: 'skeleton', facing: 'down' },
            ashRemains: { readyAt: 0, expiresAt: Infinity },
        }
        this.remains.set(id, chest)
    }

    public raisableRemains(id: string, now: number): WorldChest | undefined {
        const chest = this.remains.get(id)
        const remains = chest?.ashRemains
        return remains !== undefined &&
            now >= remains.readyAt &&
            now < remains.expiresAt &&
            sameDeath(remains.death)
            ? chest
            : undefined
    }

    public raisableCorpses(now: number): WorldChest[] {
        return [...this.remains.values()].filter(
            (chest) => this.raisableRemains(chest.id, now) !== undefined
        )
    }

    public consumeRemains(id: string, now: number): WorldChest | undefined {
        const chest = this.raisableRemains(id, now)
        if (chest === undefined) {
            return undefined
        }
        delete chest.ashRemains
        chest.title = 'Останки'
        this.remains.delete(id)
        return chest
    }

    public advanceRemains(now: number): void {
        for (const [id, chest] of this.remains) {
            const remains = chest.ashRemains
            if (
                remains !== undefined &&
                now < remains.expiresAt &&
                sameDeath(remains.death)
            ) {
                continue
            }
            delete chest.ashRemains
            this.remains.delete(id)
        }
    }

    private transfer(
        target: GameCharacter,
        allowAshRemains = true
    ): GameEventPayload[] {
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
        const trophy = canAwardDefeatTrophy(target)
            ? trophyFor(target)
            : undefined
        if (trophy !== undefined) {
            contents.push(createItemInstance(trophy))
        }
        const gold = this.wallet?.drainGold(target.id) ?? 0
        target.inventory = []
        target.equipment = {}
        return this.storeCorpse(target, id, contents, gold, allowAshRemains)
    }

    private storeCorpse(
        target: GameCharacter,
        id: string,
        contents: WorldChest['contents'],
        gold: number,
        allowAshRemains: boolean
    ): GameEventPayload[] {
        const ashRemains =
            allowAshRemains && canLeaveAshRemains(target)
                ? {
                      readyAt: target.reviveUntil,
                      expiresAt:
                          target.reviveUntil + ASH_RITE_RULES.remainsDurationMs,
                      death: { actor: target, sequence: target.deathSequence },
                  }
                : undefined
        if (contents.length === 0 && gold === 0 && ashRemains === undefined) {
            return []
        }
        const chest: WorldChest = {
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
            ...(ashRemains === undefined ? {} : { ashRemains }),
        }
        if (ashRemains !== undefined) {
            this.remains.set(id, chest)
        }
        if (contents.length === 0 && gold === 0) {
            return []
        }
        this.containers.set(id, chest)
        return [
            withWorldSound(
                { kind: 'item_drop', targetId: target.id, chestId: id },
                'drop',
                this.locationId,
                chest.position,
                { sourceBounds: containerBounds(chest.position) }
            ),
        ]
    }
}

function trophyFor(target: GameCharacter) {
    return target.faction === 'monsters' &&
        ashSummoner(target) === undefined &&
        target.controllerKind !== 'network_player' &&
        target.soul.controlSource !== 'human'
        ? HOSTILE_TROPHY_ITEMS[target.archetype]
        : undefined
}

function canLeaveAshRemains(target: GameCharacter): boolean {
    return (
        target.controllerKind !== 'network_player' &&
        target.soul.controlSource !== 'human' &&
        target.trainingTarget === undefined &&
        ashSummoner(target) === undefined &&
        (target.creatureType === 'humanoid' || target.creatureType === 'undead')
    )
}

function sameDeath(
    death: NonNullable<WorldChest['ashRemains']>['death']
): boolean {
    return (
        death === undefined ||
        (!death.actor.alive && death.actor.deathSequence === death.sequence)
    )
}

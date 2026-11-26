import {
    equipmentSlotIds,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import { chestRefusalNotice, type WorldChest } from './chestInteraction'
import type { CorpseWallet } from './corpseWallet'
import type { EquipmentState } from './inventory'

const returnDelayMs = 60_000
const deathPoseMs = 900

interface CorpseReturn {
    actor: GameCharacter
    chest: WorldChest
    sequence: number
    diedAt: number
    prayerUntil: number
    trophyId: string
    equipment: EquipmentState
    collected: boolean
}

const episodes = new WeakMap<GameCharacter, CorpseReturn>()

function currentDeath(actor: GameCharacter): CorpseReturn | undefined {
    const episode = episodes.get(actor)
    return !actor.alive && episode?.sequence === actor.deathSequence
        ? episode
        : undefined
}

export function hasPendingCorpseReturn(actor: GameCharacter): boolean {
    return currentDeath(actor)?.collected === false
}

export function corpseReturnFinalized(
    actor: GameCharacter,
    now: number
): boolean {
    const episode = currentDeath(actor)
    return episode?.collected === true && now >= episode.diedAt + deathPoseMs
}

export function defersCorpseRetirement(
    actor: GameCharacter,
    now: number
): boolean {
    return (
        currentDeath(actor) !== undefined && !corpseReturnFinalized(actor, now)
    )
}

/** Each return belongs to one death and one trophy already in the shared corpse. */
export class CorpseReturns {
    private readonly pending = new Map<string, CorpseReturn>()

    public constructor(
        private readonly chests: Map<string, WorldChest>,
        private readonly wallet?: CorpseWallet
    ) {}

    public hasPending(chestId: string): boolean {
        return this.pending.has(chestId)
    }

    public register(
        actor: GameCharacter,
        chest: WorldChest,
        trophyId: string,
        equipment: EquipmentState
    ): void {
        const episode = {
            actor,
            chest,
            sequence: actor.deathSequence,
            diedAt: actor.animationStartedAt,
            prayerUntil: actor.reviveUntil,
            trophyId,
            equipment,
            collected: false,
        }
        actor.respawnAt = 0
        episodes.set(actor, episode)
        this.pending.set(chest.id, episode)
    }

    /** Called after the ordinary bag transfer has succeeded. */
    public itemTaken(chest: WorldChest, instanceId: string): void {
        const episode = this.pending.get(chest.id)
        if (episode?.chest !== chest || episode.trophyId !== instanceId) {
            return
        }
        episode.collected = true
        episode.actor.reviveUntil = 0
        this.pending.delete(chest.id)
    }

    public consumeFinalDefeat(actor: GameCharacter): CorpseReturn | undefined {
        const episode = currentDeath(actor)
        if (episode?.collected === true) {
            episodes.delete(actor)
            return episode
        }
        return undefined
    }

    public advanceChest(chestId: string, now: number): GameEventPayload[] {
        const episode = this.pending.get(chestId)
        if (episode === undefined) {
            return []
        }
        const { actor, chest, sequence } = episode
        const sameLife = actor.deathSequence === sequence
        if (sameLife && !actor.alive && now < episode.diedAt + returnDelayMs) {
            return []
        }
        if (sameLife) {
            this.restoreRemainingLoot(episode)
        }
        this.pending.delete(chestId)
        if (episodes.get(actor) === episode) {
            episodes.delete(actor)
        }
        this.chests.delete(chest.id)
        if (!sameLife || actor.alive) {
            return []
        }
        restoreCharacter(actor, now, false)
        return [
            {
                kind: 'revive',
                eventId: `corpse-return:${actor.id}:${String(sequence)}`,
                actorId: actor.id,
                targetId: actor.id,
            },
        ]
    }

    public beforeInteraction(
        chestId: string,
        observerId: string,
        now: number,
        invalidate: (chestId: string) => void
    ): GameEventPayload[] | undefined {
        const events = this.advanceChest(chestId, now)
        if (this.chests.has(chestId)) {
            return undefined
        }
        invalidate(chestId)
        return [
            ...events,
            ...chestRefusalNotice(observerId, 'Тело больше недоступно.'),
        ]
    }

    public advance(
        now: number,
        invalidate: (chestId: string) => void
    ): GameEventPayload[] {
        const events: GameEventPayload[] = []
        for (const chestId of this.pending.keys()) {
            events.push(...this.advanceChest(chestId, now))
            if (!this.chests.has(chestId)) {
                invalidate(chestId)
            }
        }
        return events
    }

    private restoreRemainingLoot({
        actor,
        chest,
        trophyId,
        equipment,
    }: CorpseReturn): void {
        // The corpse owns these instances until this transition. Already looted items stay looted.
        for (const item of chest.contents) {
            if (item.instanceId === trophyId) {
                continue
            }
            const slot = equipmentSlotIds.find(
                (slot) => equipment[slot]?.instanceId === item.instanceId
            )
            if (slot === undefined) {
                actor.inventory.push(item)
            } else {
                actor.equipment[slot] = item
            }
        }
        const gold = chest.gold ?? 0
        if (gold > 0) {
            this.wallet?.creditLootGold(actor.id, gold)
        }
        chest.contents = []
        chest.gold = 0
    }
}

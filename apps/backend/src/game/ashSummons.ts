import type { Vector2 } from '@my-game-ratata/contracts'

import {
    ashActorAvailable as available,
    markAshSummon,
} from './ashSkeletonState'
import { GameCharacter } from './character'
import { onCharacterDeath } from './characterDeathObservers'
import type { CompanionService } from './companions'
import { type CharacterController, Mob1Controller } from './controllers'
import { registerRoomCharacter } from './roomCharacterRegistration'
import type { WorldLocations } from './worldLocations'

interface Summon {
    actor: GameCharacter
    owner: GameCharacter
    expiresAt: number
    stopWatching: () => void
}

export class AshSummons {
    private readonly summons = new Map<string, Summon>()
    private nextSummon = 1

    public constructor(
        private readonly world: () => WorldLocations,
        private readonly characters: Map<string, GameCharacter>,
        private readonly controllers: Map<string, CharacterController>,
        private readonly companions: CompanionService,
        private readonly onRemove: (actor: GameCharacter) => void
    ) {}

    public advance(now: number): void {
        for (const summon of this.summons.values()) {
            if (
                now >= summon.expiresAt ||
                !available(summon.actor) ||
                !available(summon.owner) ||
                this.characters.get(summon.owner.id) !== summon.owner ||
                summon.owner.locationId !== summon.actor.locationId
            ) {
                this.removeSummon(summon)
            }
        }
    }

    public count(owner: GameCharacter): number {
        return [...this.summons.values()].filter(
            (summon) => summon.owner === owner
        ).length
    }

    public create(
        owner: GameCharacter,
        position: Vector2,
        now: number,
        duration: number
    ): GameCharacter {
        let id: string
        do {
            id = `ash-skeleton-${owner.id}-${String(this.nextSummon++)}`
        } while (this.characters.has(id))
        const actor = new GameCharacter({
            id,
            nickname: 'Поднятый скелет',
            archetype: 'skeleton',
            controllerKind: 'mob1',
            faction: owner.faction,
            ashPact: owner.ashPact,
            locationId: owner.locationId,
            respawnPolicy: 'none',
            spawnPosition: position,
        })
        markAshSummon(actor, owner.id)
        const summon: Summon = {
            actor,
            owner,
            expiresAt: now + duration,
            stopWatching: onCharacterDeath(owner, () =>
                this.removeSummon(summon)
            ),
        }
        this.summons.set(id, summon)
        registerRoomCharacter(
            {
                character: actor,
                controller: new Mob1Controller(this.nextSummon),
            },
            {
                characters: this.characters,
                controllers: this.controllers,
                companions: this.companions,
            }
        )
        return actor
    }

    private removeSummon(summon: Summon): void {
        const { actor } = summon
        summon.stopWatching()
        this.summons.delete(actor.id)
        this.onRemove(actor)
        actor.clearPendingAttackHit()
        this.characters.delete(actor.id)
        this.controllers.delete(actor.id)
        this.world().closeChestViews(actor.id)
    }
}

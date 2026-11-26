import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { AshRites } from './ashRites'
import type { GameCharacter } from './character'
import { PolicyController } from './companionControllers'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import type { GraveCombatContext } from './graveRules'
import { GraveSpawns } from './graveSpawns'
import { LichReturns } from './lichReturns'
import { resourceOccupants } from './roomEconomy'
import { advanceRoomLives, finalizeRoomLife } from './roomLifecycle'
import type { RoomSocket } from './roomMessaging'
import type { GraveRegistration } from './roomSpawns'
import {
    captureSkeletonInheritance,
    captureSkeletonInheritanceProfile,
    inheritSkeletonProgress,
} from './skeletonProgression'
import type { WorldLocations } from './worldLocations'
import { applyEncounterDifficulty } from './worldSpawns'

export class RoomLife {
    private readonly deathSpawns = new GraveSpawns()
    private readonly lichReturns: LichReturns
    public readonly ashRites: AshRites
    public readonly graveRules: GraveCombatContext = {
        get: (id) => this.deathSpawns.get(id),
        list: (locationId) => this.deathSpawns.snapshot(locationId),
        damage: (id, amount, now) => this.deathSpawns.damage(id, amount, now),
        purify: (id, now) => this.deathSpawns.purify(id, now),
        contributePurification: (id, receiptId, now) =>
            this.deathSpawns.contributePurification(id, receiptId, now),
    }

    public constructor(
        private readonly characters: Map<string, GameCharacter>,
        private readonly connections: Map<RoomSocket, string | undefined>,
        private readonly controllers: Map<string, CharacterController>,
        private readonly nicknames: Map<string, string>,
        private readonly world: () => WorldLocations,
        private readonly companions: CompanionService,
        private readonly onEvents: (events: GameEventPayload[]) => void,
        private readonly onFinalDefeat?: (
            actor: GameCharacter,
            now: number
        ) => void
    ) {
        this.lichReturns = new LichReturns(world, characters, onEvents)
        this.ashRites = new AshRites(
            world,
            characters,
            controllers,
            companions,
            (actor, message, context) =>
                this.useHeart(actor, message.targetId, context)
        )
    }

    public graves(locationId: string) {
        return this.deathSpawns.snapshot(locationId)
    }

    public registerGraves(
        graves: readonly GraveRegistration[],
        now: number
    ): void {
        for (const { source, initialChildren, reserveRevival } of graves) {
            this.deathSpawns.register(
                source,
                initialChildren,
                now,
                undefined,
                undefined,
                reserveRevival
            )
        }
        this.deathSpawns.assignGuardians(this.characters)
    }

    public abandon(actor: GameCharacter, now: number): boolean {
        return finalizeRoomLife(this.context(now), actor, true)
    }

    public useHeart(
        actor: GameCharacter,
        chestId: string,
        context: AbilityContext
    ): GameEventPayload[] {
        return this.lichReturns.bind(actor, chestId, context)
    }

    public advance(
        now: number,
        abilityContextFor: (actor: GameCharacter, at: number) => AbilityContext
    ): void {
        this.advanceCorpseReturns(now)
        advanceRoomLives({
            ...this.context(now),
            afterRevival: () => this.advanceCorpseReturns(now),
            delayRetirement: (actor, at) => this.lichReturns.advance(actor, at),
            abilityContextFor: (actor, at) => ({
                ...abilityContextFor(actor, at),
                graves: this.graveRules,
            }),
        })
        this.deathSpawns.update(now, {
            characters: this.characters,
            navigation: (id) => this.world().get(id).navigation,
            occupants: (id) => resourceOccupants(this.world(), id),
            add: ({ character, controller }, inheritedMasteryLevel) => {
                applyEncounterDifficulty(
                    character,
                    this.world().get(character.locationId).description
                )
                this.characters.set(character.id, character)
                this.controllers.set(
                    character.id,
                    new PolicyController(this.companions, controller)
                )
                if (inheritedMasteryLevel > 0) {
                    this.onEvents(
                        inheritSkeletonProgress(
                            character,
                            inheritedMasteryLevel,
                            now
                        )
                    )
                }
            },
            remove: (id) => {
                this.world().closeChestViews(id)
                this.characters.delete(id)
                this.controllers.delete(id)
            },
        })
    }

    private advanceCorpseReturns(now: number): void {
        for (const location of this.world().locations.values()) {
            const events = location.inventory.advanceCorpseReturns(now)
            if (events.length > 0) {
                this.onEvents(events)
            }
        }
    }

    private context(now: number) {
        return {
            characters: this.characters,
            connections: this.connections,
            controllers: this.controllers,
            nicknames: this.nicknames,
            now,
            onEvents: this.onEvents,
            beforeRetire: (
                actor: GameCharacter,
                at: number,
                abandoned: boolean
            ) => {
                this.lichReturns.cancel(actor)
                this.onFinalDefeat?.(actor, at)
                const inheritedMasteryLevel = captureSkeletonInheritance(actor)
                const inheritedMasteryPath =
                    captureSkeletonInheritanceProfile(actor)?.mastery
                this.world().closeChestViews(actor.id)
                this.onEvents(
                    this.world()
                        .get(actor.locationId)
                        .inventory.finalizeDeath(actor, at, abandoned)
                )
                return () =>
                    this.deathSpawns.schedule(
                        actor,
                        at,
                        this.world().get(actor.locationId).navigation,
                        inheritedMasteryLevel,
                        inheritedMasteryPath
                    )
            },
        }
    }
}

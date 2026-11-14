import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { PolicyController } from './companionControllers'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { GraveSpawns } from './graveSpawns'
import { resourceOccupants } from './roomEconomy'
import { advanceRoomLives, finalizeRoomLife } from './roomLifecycle'
import type { RoomSocket } from './roomMessaging'
import type { GraveRegistration } from './roomSpawns'
import type { WorldLocations } from './worldLocations'
import { applyEncounterDifficulty } from './worldSpawns'

export class RoomLife {
    private readonly deathSpawns = new GraveSpawns()

    public constructor(
        private readonly characters: Map<string, GameCharacter>,
        private readonly connections: Map<RoomSocket, string | undefined>,
        private readonly controllers: Map<string, CharacterController>,
        private readonly nicknames: Map<string, string>,
        private readonly world: () => WorldLocations,
        private readonly companions: CompanionService,
        private readonly onEvents: (events: GameEventPayload[]) => void
    ) {}

    public graves(locationId: string) {
        return this.deathSpawns.snapshot(locationId)
    }

    public registerGraves(
        graves: readonly GraveRegistration[],
        now: number
    ): void {
        for (const { source, initialChildren } of graves) {
            this.deathSpawns.register(source, initialChildren, now)
        }
    }

    public abandon(actor: GameCharacter, now: number): boolean {
        return finalizeRoomLife(this.context(now), actor, true)
    }

    public advance(
        now: number,
        abilityContextFor: (actor: GameCharacter, at: number) => AbilityContext
    ): void {
        advanceRoomLives({ ...this.context(now), abilityContextFor })
        this.deathSpawns.update(now, {
            characters: this.characters,
            navigation: (id) => this.world().get(id).navigation,
            occupants: (id) => resourceOccupants(this.world(), id),
            add: ({ character, controller }) => {
                applyEncounterDifficulty(
                    character,
                    this.world().get(character.locationId).description
                )
                this.characters.set(character.id, character)
                this.controllers.set(
                    character.id,
                    new PolicyController(this.companions, controller)
                )
            },
            remove: (id) => {
                this.world().closeChestViews(id)
                this.characters.delete(id)
                this.controllers.delete(id)
            },
        })
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
                this.world().closeChestViews(actor.id)
                this.onEvents(
                    this.world()
                        .get(actor.locationId)
                        .inventory.finalizeDeath(actor, at, abandoned)
                )
            },
            afterRetire: (actor: GameCharacter, at: number) =>
                this.deathSpawns.schedule(actor, at),
        }
    }
}

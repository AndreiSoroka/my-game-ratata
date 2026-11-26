import type { GameEventPayload } from '@my-game-ratata/contracts'

import { archiveRoomConversations } from '../ai/memoryLifecycle'
import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import { defersDefeatCredit } from './corpseReturnTrophy'
import { creditsDefeat, isCurrentDeathEvent } from './damageEvents'
import { isPveOpponent } from './factions'
import type { PartyService } from './parties'
import { publishRoomEvents } from './roomEvents'
import type { RoomSocket } from './roomMessaging'
import { connectionsInLocation } from './roomQueries'
import type { RoomSocial } from './roomSocial'
import { rewardSkeletonKill } from './skeletonKillReward'
import type { RoomSpeechTranslations } from './speechTranslation'
import type { WorldLocations } from './worldLocations'

interface EventPipelineOptions {
    archivePerson: (id: string, now: number) => void
    hasModelLease: (actor: GameCharacter, now: number) => boolean
    observeCombat: (events: readonly GameEventPayload[], now: number) => void
    world: () => WorldLocations
    speechTranslations: () => RoomSpeechTranslations
    now?: () => number
}

/** Fallen guards are observed immediately. Only their final defeat advances objectives. */
export class RoomEventPipeline {
    private readonly fallen = new WeakMap<
        GameCharacter,
        { sequence: number; event: GameEventPayload; hostile: boolean }
    >()

    public constructor(
        private readonly characters: Map<string, GameCharacter>,
        private readonly connections: Map<RoomSocket, string | undefined>,
        private readonly adventure: AdventureService,
        private readonly parties: PartyService,
        private readonly social: RoomSocial,
        private readonly options: EventPipelineOptions
    ) {}

    public publish(events: GameEventPayload[]): void {
        events = events.filter((event) => {
            if (event.kind !== 'death' || event.targetId === undefined) {
                return true
            }
            const target = this.characters.get(event.targetId)
            return target === undefined || isCurrentDeathEvent(event, target)
        })
        if (events.length === 0) {
            return
        }
        const now = (this.options.now ?? Date.now)()
        const objectiveEvents = events.filter(
            (event) => !this.deferDefeat(event)
        )
        archiveRoomConversations(
            events,
            this.characters.values(),
            this.options.archivePerson,
            now
        )
        this.social.observe(objectiveEvents)
        publishRoomEvents(
            events,
            this.characters,
            this.adventure,
            this.parties,
            (id) =>
                connectionsInLocation(
                    this.connections,
                    this.characters,
                    id
                ).keys(),
            this.connections,
            this.options.world(),
            this.options.hasModelLease,
            objectiveEvents,
            this.options.speechTranslations(),
            now
        )
        this.options.observeCombat(events, now)
    }

    public finalDefeat(actor: GameCharacter, now: number): void {
        const defeat = this.fallen.get(actor)
        if (defeat?.sequence !== actor.deathSequence) {
            return
        }
        this.fallen.delete(actor)
        const events = [defeat.event]
        const find = (id: string) => this.characters.get(id)
        const world = this.options.world()
        this.social.observe(events)
        this.adventure.observe(
            events,
            find,
            (target) => world.get(target.locationId).navigation
        )
        this.parties.observe(events, find)
        const killer = find(defeat.event.actorId ?? '')
        if (killer !== undefined && defeat.hostile) {
            this.publish(rewardSkeletonKill(killer, actor, now))
        }
    }

    private deferDefeat(event: GameEventPayload): boolean {
        if (event.targetId === undefined) {
            return false
        }
        const actor = this.characters.get(event.targetId)
        if (actor === undefined) {
            return false
        }
        if (event.kind === 'revive' && actor.alive) {
            this.fallen.delete(actor)
        }
        if (event.kind !== 'death' || !defersDefeatCredit(actor)) {
            return false
        }
        if (this.fallen.get(actor)?.sequence !== actor.deathSequence) {
            const killer = this.characters.get(event.actorId ?? '')
            const hostile =
                killer !== undefined &&
                creditsDefeat(event) &&
                isPveOpponent(killer, actor)
            this.fallen.set(actor, {
                sequence: actor.deathSequence,
                event,
                hostile,
            })
        }
        return true
    }
}

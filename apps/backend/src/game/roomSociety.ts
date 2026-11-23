import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import type { NpcHeardSpeech } from './roomNpcConversations'
import {
    type BusyResident,
    isCityRumorResident,
    RoomRumorMeetings,
} from './roomRumorMeetings'
import { RoomSpeechWarnings } from './roomSpeechWarnings'
import { SocialHistory } from './socialHistory'
import { speechAvailable } from './socialSpeech'
import {
    chooseHeardSocialReaction,
    type HeardSocialReaction,
    type SpeechConflicts,
} from './societyDialogue'

/** The room chooses real encounters. SocialHistory owns the rules shared by both clocks. */
export class RoomSociety {
    public readonly history: SocialHistory
    public readonly warnings: RoomSpeechWarnings
    public conflicts: SpeechConflicts | undefined
    private occupied = false
    private seeded = false
    private readonly meetings: RoomRumorMeetings
    private readonly heardReactions = new WeakMap<
        GameCharacter,
        Map<string, HeardSocialReaction>
    >()

    public constructor(
        private readonly room: GameRoom,
        private readonly actors: () => Iterable<GameCharacter>
    ) {
        this.warnings = new RoomSpeechWarnings(
            room,
            (actor, now) =>
                this.conflicts?.hasPhysicalReaction(actor, now) === true
        )
        this.history = new SocialHistory({
            participant: (id) => this.participant(id),
            residents: (locationId) =>
                this.residents(locationId).map((npc) => npc.id),
            react: (id, decision, now) =>
                this.room.getCharacter(id)?.temperament.react(decision, now),
            resentment: (id) =>
                this.room.getCharacter(id)?.temperament.traits.resentment,
        })
        this.meetings = new RoomRumorMeetings(
            room,
            this.history,
            (locationId) => this.residents(locationId)
        )
    }

    public presence(occupied: boolean): void {
        if (this.occupied === occupied) {
            return
        }
        this.occupied = occupied
        if (!occupied) {
            this.stopVisit()
        }
        this.history.advanceBackground(
            CENTER_LOCATION_ID,
            occupied,
            this.room.realNow(),
            this.room.gameplayNow()
        )
    }

    public background(realNow: number, gameNow: number): void {
        this.warnings.advance(realNow, gameNow)
        if (this.occupied) {
            return
        }
        this.seedCityContacts()
        this.history.advanceBackground(
            CENTER_LOCATION_ID,
            false,
            realNow,
            gameNow
        )
    }

    public observeDialogue(
        npc: GameCharacter,
        event: NpcHeardSpeech,
        model = true
    ): NpcHeardSpeech {
        const heard =
            this.heardReactions.get(npc) ??
            new Map<string, HeardSocialReaction>()
        const remembered = heard.get(event.id)
        if (remembered !== undefined) {
            return { ...event, socialReaction: remembered }
        }
        const reaction = chooseHeardSocialReaction(
            this.room,
            this.history,
            npc,
            event,
            this.conflicts
        )
        if (reaction === undefined) {
            return event
        }
        heard.set(event.id, reaction)
        this.heardReactions.set(npc, heard)
        this.resolveSpokenConflict(npc, event, reaction, model)
        return { ...event, socialReaction: reaction }
    }

    private resolveSpokenConflict(
        npc: GameCharacter,
        event: NpcHeardSpeech,
        reaction: NonNullable<NpcHeardSpeech['socialReaction']>,
        model: boolean
    ): void {
        const { action, trigger } = reaction
        if (trigger !== 'insult' && trigger !== 'threat') {
            return
        }
        if (action === 'warn') {
            this.warnings.respond(npc, event, trigger, model)
            return
        }
        if (action !== 'attack' && action !== 'flee') {
            return
        }
        const speaker = this.room.getCharacter(event.senderId)
        if (this.conflicts === undefined || speaker === undefined) {
            return
        }
        this.room.publishEvents(
            this.conflicts.apply(
                npc,
                speaker,
                action,
                {
                    id: `speech:${event.id}:${npc.id}`,
                    kind: trigger,
                    locationId: event.locationId,
                },
                event.at
            )
        )
        if (this.conflicts.hasPhysicalReaction(npc, event.at)) {
            this.warnings.cancelFor(npc, event.at)
        }
    }

    public prepareMeetings(now: number, busy: BusyResident): void {
        if (this.occupied) {
            this.seedCityContacts()
            this.meetings.prepareMeetings(now, busy)
        }
    }

    public controlsVisit(npc: GameCharacter): boolean {
        return this.meetings.controlsVisit(npc)
    }

    public stopVisit(): void {
        this.meetings.stopVisit()
    }

    private participant(id: string) {
        const actor = this.room.getCharacter(id)
        return actor === undefined
            ? undefined
            : {
                  id,
                  locationId: actor.locationId,
                  available:
                      actor.alive &&
                      !actor.tags.has('offline') &&
                      !actor.tags.has('state.retired'),
                  canSpeak: actor.soul.canSpeak,
              }
    }

    private residents(locationId: string): GameCharacter[] {
        return [...this.actors()].filter(
            (npc) =>
                isCityRumorResident(npc, locationId) && speechAvailable(npc)
        )
    }

    private seedCityContacts(): void {
        if (this.seeded) {
            return
        }
        const residents = this.residents(CENTER_LOCATION_ID)
        const coordinator = residents.find(
            (npc) => npc.id === 'npc_friendly_girl_1'
        )
        if (coordinator === undefined) {
            return
        }
        this.seeded = true
        for (const citizen of residents) {
            if (citizen !== coordinator) {
                this.history.noteMeeting(coordinator.id, citizen.id)
            }
        }
    }
}

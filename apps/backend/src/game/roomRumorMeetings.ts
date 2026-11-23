import { CENTER_LOCATION_ID, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { companionProfiles } from './companionProfiles'
import type { GameRoom } from './room'
import type { SocialHistory } from './socialHistory'
import type { SocialRumorEncounter } from './socialHistoryTypes'
import {
    canConverseWithNpc,
    canHearSpeech,
    speechAvailable,
} from './socialSpeech'
import { attributeNpcSpeech, createSpeechEvent } from './speechReceipts'

const refreshMeetingsMs = 2_000
const visitTimeoutMs = 30_000
const contactRange = 48

export type BusyResident = (actor: GameCharacter) => boolean
interface CityVisit {
    encounter: SocialRumorEncounter
    mover: GameCharacter
    path: Vector2[]
    deadline: number
}

export class RoomRumorMeetings {
    private nextMeetingAt = 0
    private visit: CityVisit | undefined
    private readonly unreachableUntil = new Map<string, number>()

    public constructor(
        private readonly room: GameRoom,
        private readonly history: SocialHistory,
        private readonly residents: (locationId: string) => GameCharacter[]
    ) {}

    public prepareMeetings(now: number, busy: BusyResident): void {
        if (this.visit !== undefined) {
            this.advanceVisit(now, busy)
            return
        }
        if (now < this.nextMeetingAt) {
            return
        }
        this.nextMeetingAt = now + refreshMeetingsMs
        const encounter = this.history.nextEncounter(
            CENTER_LOCATION_ID,
            (candidate) => this.canMeet(candidate, now, busy)
        )
        if (encounter !== undefined) {
            this.beginMeeting(encounter, now)
        }
    }

    public controlsVisit(npc: GameCharacter): boolean {
        return this.visit?.mover === npc && npc.path === this.visit.path
    }

    public stopVisit(): void {
        const visit = this.visit
        this.visit = undefined
        if (visit !== undefined && visit.mover.path === visit.path) {
            visit.mover.clearPath()
        }
    }

    private canMeet(
        encounter: SocialRumorEncounter,
        now: number,
        busy: BusyResident
    ): boolean {
        const pair = this.findPair(encounter)
        if (pair === undefined || pair.some(busy)) {
            return false
        }
        return (
            this.inHearing(pair, now) ||
            ((this.unreachableUntil.get(meetingKey(encounter)) ?? 0) <= now &&
                pair.some(canVisit))
        )
    }

    private findPair(
        encounter: SocialRumorEncounter
    ): [GameCharacter, GameCharacter] | undefined {
        const speaker = this.room.getCharacter(encounter.speakerId)
        const listener = this.room.getCharacter(encounter.listenerId)
        return speaker !== undefined &&
            listener !== undefined &&
            [speaker, listener].every(
                (actor) =>
                    isCityRumorResident(actor, encounter.locationId) &&
                    speechAvailable(actor)
            )
            ? [speaker, listener]
            : undefined
    }

    private inHearing(
        pair: [GameCharacter, GameCharacter],
        now: number
    ): boolean {
        const [speaker, listener] = pair
        return canConverseWithNpc(
            speaker,
            listener,
            this.room.navigationFor(speaker),
            now,
            contactRange
        )
    }

    private beginMeeting(encounter: SocialRumorEncounter, now: number): void {
        const pair = this.findPair(encounter)
        if (pair === undefined) {
            return
        }
        if (this.inHearing(pair, now)) {
            this.tell(encounter, pair, now)
            return
        }
        const [speaker, listener] = pair
        const mover = canVisit(listener) ? listener : speaker
        const home =
            mover === listener ? speaker.spawnPosition : listener.spawnPosition
        const path = this.room
            .navigationFor(mover)
            .findPathWorld(mover.position, home)
        if (path.length > 0) {
            mover.setPath(path)
            if (mover.path === path) {
                this.visit = {
                    encounter,
                    mover,
                    path,
                    deadline: now + visitTimeoutMs,
                }
                return
            }
        }
        this.deferMeeting(encounter, now)
    }

    private advanceVisit(now: number, busy: BusyResident): void {
        const visit = this.visit
        if (visit === undefined) {
            return
        }
        const pair = this.findPair(visit.encounter)
        if (
            pair !== undefined &&
            !pair.some(busy) &&
            this.inHearing(pair, now)
        ) {
            this.stopVisit()
            this.tell(visit.encounter, pair, now)
        } else if (
            pair === undefined ||
            pair.some(busy) ||
            visit.mover.path !== visit.path ||
            now >= visit.deadline
        ) {
            this.stopVisit()
            this.deferMeeting(visit.encounter, now)
        }
    }

    private deferMeeting(encounter: SocialRumorEncounter, now: number): void {
        this.unreachableUntil.set(meetingKey(encounter), now + visitTimeoutMs)
        for (const [key, until] of this.unreachableUntil) {
            if (until <= now) {
                this.unreachableUntil.delete(key)
            }
        }
    }

    private tell(
        encounter: SocialRumorEncounter,
        pair: [GameCharacter, GameCharacter],
        now: number
    ): void {
        const receipt = this.history.share(encounter, now)
        if (receipt.status !== 'told') {
            return
        }
        const [speaker, listener] = pair
        const heard = this.residents(encounter.locationId)
            .filter(
                (resident) =>
                    resident !== listener &&
                    canHearSpeech(
                        resident,
                        speaker,
                        this.room.navigationFor(speaker),
                        now
                    )
            )
            .map((resident) => resident.id)
        this.history.overhear(receipt.transmissionId, heard, now)
        const subject =
            this.room.getCharacter(receipt.incident.actorId)?.nickname ??
            'незнакомец'
        const target =
            this.room.getCharacter(receipt.incident.targetId)?.nickname ??
            'другой путник'
        const account = rumorAccount(receipt.incident.kind, subject, target)
        const firsthand = receipt.knowledge.witnessId === speaker.id
        const source = firsthand
            ? 'Это случилось у меня на глазах.'
            : 'Мне рассказали об этом.'
        const emphasis =
            receipt.incident.severity >= 4 ? ' Дело серьёзное.' : ''
        const speech = createSpeechEvent(
            speaker,
            `${source} ${account}${emphasis}`
        )
        this.room.publishEvents([attributeNpcSpeech(speech, listener.id)])
    }
}

export function isCityRumorResident(
    actor: GameCharacter,
    locationId: string
): boolean {
    return (
        actor.locationId === locationId &&
        actor.spawnLocationId === CENTER_LOCATION_ID &&
        actor.controllerKind !== 'network_player' &&
        actor.soul.controlSource !== 'human' &&
        actor.faction === 'peaceful' &&
        actor.soul.canSpeak
    )
}

function canVisit(actor: GameCharacter): boolean {
    return (
        (actor.id === 'npc_friendly_girl_1' ||
            companionProfiles[actor.id]?.stationary === false) &&
        actor.soul.controlSource === 'script' &&
        !actor.hasPath() &&
        actor.soul.companion?.leaderId == null
    )
}

function meetingKey(encounter: SocialRumorEncounter): string {
    return JSON.stringify([
        encounter.incidentId,
        encounter.speakerId,
        encounter.listenerId,
    ])
}

function rumorAccount(kind: string, subject: string, target: string): string {
    switch (kind) {
        case 'theft':
            return `${subject} замечен в попытке кражи. Пострадавший — ${target}.`
        case 'attack':
            return `Произошло нападение. Нападавший — ${subject}, пострадавший — ${target}.`
        case 'threat':
            return `Звучали угрозы. За них в ответе ${subject}. Свидетель — ${target}.`
        case 'insult':
            return `Было оскорбление. ${subject} обратился с ним к персонажу по имени ${target}.`
        case 'help':
            return `${subject} пришёл на помощь, когда ${target} это было нужно.`
        default:
            return `Это касается тех двоих. Одного зовут ${subject}, другого — ${target}.`
    }
}

import type {
    KnownSocialIncident,
    SocialHistoryWorld,
    SocialIncident,
    SocialRelationship,
    SocialRumorEncounter,
    SocialRumorReceipt,
} from './socialHistoryTypes'
import {
    hearRumor,
    reportedSeverity,
    type SpokenRumor,
    willTellRumor,
} from './socialRumorReport'
import { socialKey } from './socialScores'

interface SocialRumorLedger {
    incident(id: string): SocialIncident | undefined
    known(id: string, locationId: string): readonly KnownSocialIncident[]
    knows(id: string, incidentId: string): KnownSocialIncident | undefined
    remember(id: string, entry: KnownSocialIncident): void
    acquainted(leftId: string, rightId: string): boolean
    relationship(
        observerId: string,
        subjectId: string,
        now: number
    ): SocialRelationship
}

interface CandidateReport {
    encounter: SocialRumorEncounter
    source: KnownSocialIncident
}

export class SocialRumors {
    private readonly attempted = new Map<string, 'withheld' | 'told'>()
    private readonly spoken = new Map<string, SpokenRumor>()
    private spokenAt: number | undefined

    public constructor(
        private readonly world: SocialHistoryWorld,
        private readonly ledger: SocialRumorLedger
    ) {}

    public nextEncounter(
        locationId: string,
        eligible?: (encounter: SocialRumorEncounter) => boolean
    ): SocialRumorEncounter | undefined {
        const residents = this.residentIds(locationId)
        for (const speakerId of residents) {
            for (const { encounter } of this.encountersFor(
                speakerId,
                locationId,
                residents
            )) {
                if (eligible === undefined || eligible(encounter)) {
                    return encounter
                }
            }
        }
        return undefined
    }

    public backgroundRound(
        locationId: string,
        now: number
    ): SocialRumorReceipt[] {
        const planned: CandidateReport[] = []
        const residents = this.residentIds(locationId)
        for (const speakerId of residents) {
            for (const report of this.encountersFor(
                speakerId,
                locationId,
                residents
            )) {
                planned.push(report)
                break
            }
        }
        return planned.map(({ encounter, source }) =>
            this.transmit(encounter, source, now, false)
        )
    }

    public share(
        encounter: SocialRumorEncounter,
        now: number
    ): SocialRumorReceipt {
        const source = this.ledger.knows(
            encounter.speakerId,
            encounter.incidentId
        )
        return this.transmit(encounter, source, now, true)
    }

    public overhear(
        transmissionId: string,
        listenerIds: readonly string[],
        now: number
    ): KnownSocialIncident[] {
        const rumor = this.spoken.get(transmissionId)
        if (
            rumor === undefined ||
            this.spokenAt !== now ||
            !this.incidentPresent(rumor.incident) ||
            !this.canSpeakAt(
                rumor.encounter.speakerId,
                rumor.encounter.locationId
            )
        ) {
            return []
        }
        const heard: KnownSocialIncident[] = []
        for (const listenerId of new Set(listenerIds)) {
            const entry = this.hearFromNearby(rumor, listenerId, now)
            if (entry !== undefined) {
                heard.push(entry)
            }
        }
        return heard
    }

    private residentIds(locationId: string): string[] {
        return [...new Set(this.world.residents(locationId))].sort()
    }

    private *encountersFor(
        speakerId: string,
        locationId: string,
        residentIds: readonly string[]
    ): Iterable<CandidateReport> {
        if (!this.canSpeakAt(speakerId, locationId)) {
            return
        }
        for (const source of this.ledger.known(speakerId, locationId)) {
            if (
                !source.believed ||
                !this.incidentPresent(source) ||
                this.rumorIncident(source.incidentId) === undefined
            ) {
                continue
            }
            for (const listenerId of residentIds) {
                const encounter = {
                    incidentId: source.incidentId,
                    locationId,
                    speakerId,
                    listenerId,
                }
                if (
                    this.canTell(encounter, source) &&
                    !this.attempted.has(encounterKey(encounter))
                ) {
                    yield { encounter, source }
                }
            }
        }
    }

    private transmit(
        encounter: SocialRumorEncounter,
        source: KnownSocialIncident | undefined,
        now: number,
        live: boolean
    ): SocialRumorReceipt {
        const transmissionId = encounterKey(encounter)
        if (this.attempted.has(transmissionId)) {
            return { status: 'already_attempted' }
        }
        const incident = this.rumorIncident(encounter.incidentId)
        if (
            incident === undefined ||
            source?.believed !== true ||
            incident.locationId !== encounter.locationId ||
            !this.incidentPresent(incident) ||
            !this.canSpeakAt(encounter.speakerId, encounter.locationId) ||
            !this.canTell(encounter, source)
        ) {
            return { status: 'unavailable' }
        }
        const relationship = this.ledger.relationship(
            encounter.speakerId,
            encounter.listenerId,
            now
        )
        const willing = willTellRumor(
            this.world,
            encounter,
            source,
            relationship,
            now
        )
        this.attempted.set(transmissionId, willing ? 'told' : 'withheld')
        if (!willing) {
            return { status: 'withheld' }
        }
        const heard = {
            ...incident,
            severity: reportedSeverity(
                incident.severity,
                source.severity,
                transmissionId
            ),
        }
        const rumor = { encounter: { ...encounter }, incident: heard, source }
        if (live) {
            this.rememberSpeech(transmissionId, rumor, now)
        }
        const knowledge = this.hear(rumor, encounter.listenerId, now)
        return {
            status: 'told',
            transmissionId,
            incident: { ...heard },
            knowledge,
        }
    }

    private canTell(
        encounter: SocialRumorEncounter,
        source: KnownSocialIncident
    ): boolean {
        const { speakerId, listenerId, incidentId, locationId } = encounter
        return (
            speakerId !== listenerId &&
            listenerId !== source.actorId &&
            this.ledger.acquainted(speakerId, listenerId) &&
            this.present(listenerId, locationId) &&
            this.ledger.knows(listenerId, incidentId)?.firsthand !== true
        )
    }

    private rememberSpeech(
        transmissionId: string,
        rumor: SpokenRumor,
        now: number
    ): void {
        if (this.spokenAt !== now) {
            this.spoken.clear()
            this.spokenAt = now
        }
        this.spoken.set(transmissionId, rumor)
    }

    private hearFromNearby(
        rumor: SpokenRumor,
        listenerId: string,
        now: number
    ): KnownSocialIncident | undefined {
        const encounter = { ...rumor.encounter, listenerId }
        const key = encounterKey(encounter)
        if (
            listenerId === encounter.speakerId ||
            this.attempted.get(key) === 'told' ||
            !this.present(listenerId, encounter.locationId) ||
            this.ledger.knows(listenerId, encounter.incidentId)?.firsthand ===
                true
        ) {
            return undefined
        }
        this.attempted.set(key, 'told')
        return this.hear(rumor, listenerId, now)
    }

    private hear(
        rumor: SpokenRumor,
        listenerId: string,
        now: number
    ): KnownSocialIncident {
        const relationship = this.ledger.relationship(
            listenerId,
            rumor.encounter.speakerId,
            now
        )
        const entry = hearRumor(
            this.world,
            rumor,
            listenerId,
            relationship,
            now
        )
        this.ledger.remember(listenerId, entry)
        return entry
    }

    private incidentPresent(
        incident: Pick<SocialIncident, 'actorId' | 'targetId' | 'locationId'>
    ): boolean {
        return (
            this.present(incident.actorId, incident.locationId) &&
            this.present(incident.targetId, incident.locationId)
        )
    }

    private present(id: string, locationId: string): boolean {
        const participant = this.world.participant(id)
        return (
            participant?.available === true &&
            participant.locationId === locationId
        )
    }

    private canSpeakAt(id: string, locationId: string): boolean {
        return (
            this.present(id, locationId) &&
            this.world.participant(id)?.canSpeak === true
        )
    }

    private rumorIncident(id: string): SocialIncident | undefined {
        const incident = this.ledger.incident(id)
        return incident?.visibility === 'participants' ? undefined : incident
    }
}

function encounterKey(encounter: SocialRumorEncounter): string {
    const { incidentId, speakerId, listenerId } = encounter
    return socialKey(incidentId, speakerId, listenerId)
}

import type {
    KnownSocialIncident,
    SocialHistoryWorld,
    SocialIncident,
    SocialRelationship,
    SocialReputation,
    SocialRumorEncounter,
    SocialRumorReceipt,
} from './socialHistoryTypes'
import { SocialRumorClock } from './socialRumorClock'
import { SocialRumors } from './socialRumors'
import { socialKey, SocialScores } from './socialScores'

/** Authoritative receipts and each observer's knowledge are intentionally separate. */
export class SocialHistory {
    private readonly incidents = new Map<string, SocialIncident>()
    private readonly memories = new Map<
        string,
        Map<string, KnownSocialIncident>
    >()
    private readonly contacts = new Set<string>()
    private readonly scores = new SocialScores()
    private readonly observedScores = new SocialScores()
    private readonly clock = new SocialRumorClock()
    private readonly rumors: SocialRumors

    public constructor(private readonly world: SocialHistoryWorld) {
        this.rumors = new SocialRumors(world, {
            incident: (id) => this.incidents.get(id),
            known: (id, locationId) => this.knownIncidents(id, locationId),
            knows: (id, incidentId) => this.memories.get(id)?.get(incidentId),
            remember: (id, entry) => this.remember(id, entry),
            acquainted: (left, right) =>
                this.contacts.has(contactKey(left, right)),
            relationship: (observerId, subjectId, now) =>
                this.relationship(observerId, subjectId, now),
        })
    }

    public record(
        incident: SocialIncident,
        direct: readonly string[]
    ): boolean {
        if (!validIncident(incident)) {
            return false
        }
        const existing = this.incidents.get(incident.id)
        const publicized = isPublicProvocation(existing, incident)
        if (
            existing !== undefined &&
            !sameIncident(existing, incident, publicized)
        ) {
            return false
        }
        const witnesses = [...new Set(direct)].filter((id) =>
            this.directWitness(id, incident)
        )
        if (
            witnesses.length === 0 ||
            !this.inLocation(incident.actorId, incident.locationId) ||
            !this.inLocation(incident.targetId, incident.locationId)
        ) {
            return false
        }
        const newRecord = existing === undefined || publicized
        const receipt = newRecord ? { ...incident } : existing
        if (newRecord) {
            this.incidents.set(receipt.id, receipt)
            if (receipt.visibility !== 'participants') {
                this.scores.changeReputation(
                    receipt.locationId,
                    receipt.actorId,
                    receipt.kind,
                    receipt.severity
                )
            }
        }
        for (const witnessId of witnesses) {
            this.remember(witnessId, observed(receipt, witnessId))
        }
        return true
    }

    public noteMeeting(leftId: string, rightId: string): void {
        const left = this.world.participant(leftId)
        if (
            leftId !== rightId &&
            left?.available === true &&
            this.present(rightId, left.locationId)
        ) {
            this.contacts.add(contactKey(leftId, rightId))
        }
    }

    public relationship(
        observerId: string,
        subjectId: string,
        now?: number
    ): SocialRelationship {
        return this.scores.relationship(
            observerId,
            subjectId,
            now,
            this.world.resentment?.(observerId)
        )
    }

    public communityReputation(
        locationId: string,
        subjectId: string
    ): SocialReputation {
        return this.scores.reputation(locationId, subjectId)
    }

    public knownReputation(
        observerId: string,
        locationId: string,
        subjectId: string
    ): SocialReputation {
        return this.observedScores.reputation(
            socialKey(locationId, observerId),
            subjectId
        )
    }

    public knownIncidents(
        observerId: string,
        locationId: string,
        subjectId?: string
    ): KnownSocialIncident[] {
        const known = this.memories.get(observerId)
        if (known === undefined) {
            return []
        }
        return [...known.values()]
            .filter(
                (entry) =>
                    entry.locationId === locationId &&
                    (subjectId === undefined ||
                        entry.actorId === subjectId ||
                        entry.targetId === subjectId)
            )
            .sort((left, right) =>
                right.at === left.at
                    ? left.incidentId.localeCompare(right.incidentId)
                    : right.at - left.at
            )
            .map((entry) => ({ ...entry }))
    }

    public nextEncounter(
        locationId: string,
        eligible?: (encounter: SocialRumorEncounter) => boolean
    ): SocialRumorEncounter | undefined {
        return this.rumors.nextEncounter(locationId, eligible)
    }

    public share(
        encounter: SocialRumorEncounter,
        now: number
    ): SocialRumorReceipt {
        return this.rumors.share(encounter, now)
    }

    public overhear(
        transmissionId: string,
        listenerIds: readonly string[],
        now: number
    ): KnownSocialIncident[] {
        return this.rumors.overhear(transmissionId, listenerIds, now)
    }

    public advanceBackground(
        locationId: string,
        occupied: boolean,
        realNow: number,
        gameNow = realNow
    ): SocialRumorReceipt[] | undefined {
        return this.clock.due(locationId, occupied, realNow)
            ? this.rumors.backgroundRound(locationId, gameNow)
            : undefined
    }

    private remember(observerId: string, entry: KnownSocialIncident): void {
        const known =
            this.memories.get(observerId) ??
            new Map<string, KnownSocialIncident>()
        const previous = known.get(entry.incidentId)
        if (!addsKnowledge(previous, entry)) {
            return
        }
        known.set(entry.incidentId, { ...entry })
        this.memories.set(observerId, known)
        if (previous?.believed !== true && entry.believed) {
            this.creditKnowledge(observerId, entry)
        }
    }

    private creditKnowledge(
        observerId: string,
        entry: KnownSocialIncident
    ): void {
        this.observedScores.changeReputation(
            socialKey(entry.locationId, observerId),
            entry.actorId,
            entry.kind,
            entry.severity
        )
        const strength =
            entry.firsthand && observerId === entry.targetId ? 1 : 0.5
        this.scores.changeRelationship(
            observerId,
            entry.actorId,
            entry.kind,
            entry.severity * strength,
            entry.learnedAt,
            this.world.resentment?.(observerId)
        )
    }

    private present(id: string, locationId: string): boolean {
        const participant = this.world.participant(id)
        return (
            participant?.available === true &&
            participant.locationId === locationId
        )
    }

    private inLocation(id: string, locationId: string): boolean {
        return this.world.participant(id)?.locationId === locationId
    }

    private directWitness(id: string, incident: SocialIncident): boolean {
        return (
            id !== incident.actorId &&
            (id === incident.targetId
                ? this.inLocation(id, incident.locationId)
                : incident.visibility !== 'participants' &&
                  this.present(id, incident.locationId))
        )
    }
}

function validIncident(incident: SocialIncident): boolean {
    return (
        incident.id.length > 0 &&
        incident.actorId !== incident.targetId &&
        Number.isFinite(incident.at) &&
        Number.isInteger(incident.severity) &&
        incident.severity >= 1 &&
        incident.severity <= 5
    )
}

/** An audible repeat may widen a private provocation without creating another incident. */
function isPublicProvocation(
    prior: SocialIncident | undefined,
    repeat: SocialIncident
): boolean {
    return (
        prior?.visibility === 'participants' &&
        repeat.visibility === undefined &&
        (prior.kind === 'insult' || prior.kind === 'threat')
    )
}

function sameIncident(
    left: SocialIncident,
    right: SocialIncident,
    publicized: boolean
): boolean {
    return (
        left.kind === right.kind &&
        left.actorId === right.actorId &&
        left.targetId === right.targetId &&
        left.locationId === right.locationId &&
        left.severity === right.severity &&
        (left.visibility === right.visibility || publicized)
    )
}

function observed(
    incident: SocialIncident,
    witnessId: string
): KnownSocialIncident {
    return {
        incidentId: incident.id,
        kind: incident.kind,
        actorId: incident.actorId,
        targetId: incident.targetId,
        locationId: incident.locationId,
        at: incident.at,
        learnedAt: incident.at,
        severity: incident.severity,
        confidence: 100,
        believed: true,
        firsthand: true,
        witnessId,
    }
}

function addsKnowledge(
    previous: KnownSocialIncident | undefined,
    entry: KnownSocialIncident
): boolean {
    if (previous === undefined) {
        return true
    }
    if (previous.firsthand) {
        return false
    }
    if (entry.firsthand || previous.believed !== entry.believed) {
        return entry.believed
    }
    return entry.confidence > previous.confidence
}

function contactKey(leftId: string, rightId: string): string {
    return leftId < rightId
        ? socialKey(leftId, rightId)
        : socialKey(rightId, leftId)
}

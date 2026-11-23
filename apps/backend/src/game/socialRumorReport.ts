import type {
    KnownSocialIncident,
    SocialHistoryWorld,
    SocialIncident,
    SocialRelationship,
    SocialRumorEncounter,
    SocialSeverity,
} from './socialHistoryTypes'
import { socialRoll } from './socialRumorClock'

export interface SpokenRumor {
    encounter: SocialRumorEncounter
    incident: SocialIncident
    source: KnownSocialIncident
}

export function hearRumor(
    world: SocialHistoryWorld,
    rumor: SpokenRumor,
    listenerId: string,
    relationship: SocialRelationship,
    now: number
): KnownSocialIncident {
    const { encounter, incident, source } = rumor
    const believed =
        world.react(
            listenerId,
            {
                incidentId: incident.id,
                trigger: 'hear_news',
                revision: encounter.speakerId,
                sourceId: encounter.speakerId,
                severity: incident.severity,
                available: ['believe', 'doubt'],
                context: {
                    ...relationship,
                    importance: incident.severity * 20,
                },
            },
            now
        )?.action === 'believe'
    const confidence = Math.max(
        1,
        Math.min(
            source.confidence - 5,
            Math.round((believed ? 68 : 22) + relationship.trust / 5),
            believed ? 95 : 39
        )
    )
    const entry: KnownSocialIncident = {
        incidentId: incident.id,
        kind: incident.kind,
        actorId: incident.actorId,
        targetId: incident.targetId,
        locationId: incident.locationId,
        at: incident.at,
        learnedAt: now,
        severity: incident.severity,
        confidence,
        believed,
        firsthand: false,
        witnessId: source.witnessId,
        heardFromId: encounter.speakerId,
    }
    return entry
}

export function reportedSeverity(
    origin: SocialSeverity,
    incoming: SocialSeverity,
    key: string
): SocialSeverity {
    if (socialRoll('distortion', key) >= 0.1) {
        return incoming
    }
    const options = [incoming - 1, incoming + 1].filter(
        (value): value is SocialSeverity =>
            value >= 1 && value <= 5 && Math.abs(value - origin) <= 1
    )
    return (
        options[Math.floor(socialRoll('direction', key) * options.length)] ??
        incoming
    )
}

export function willTellRumor(
    world: SocialHistoryWorld,
    encounter: SocialRumorEncounter,
    source: KnownSocialIncident,
    relationship: SocialRelationship,
    now: number
): boolean {
    const choice = source.firsthand ? 'report' : 'share'
    return (
        world.react(
            encounter.speakerId,
            {
                incidentId: encounter.incidentId,
                trigger: source.firsthand ? 'report_news' : 'share_news',
                revision: encounter.listenerId,
                sourceId: encounter.listenerId,
                severity: source.severity,
                available: [choice, 'ignore'],
                context: {
                    ...relationship,
                    importance: source.severity * 20,
                },
            },
            now
        )?.action === choice
    )
}

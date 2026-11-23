import type {
    SocialIncidentKind,
    SocialRelationship,
    SocialReputation,
    SocialSeverity,
} from './socialHistoryTypes'

const emptyRelationship: SocialRelationship = {
    liking: 0,
    trust: 0,
    respect: 0,
    grudge: 0,
}

const emptyReputation: SocialReputation = {
    honesty: 0,
    usefulness: 0,
    danger: 0,
}

interface RelationshipState {
    score: SocialRelationship
    updatedAt: number
}

const relationshipChanges: Partial<
    Record<SocialIncidentKind, SocialRelationship>
> = {
    introduction: { liking: 3, trust: 1, respect: 1, grudge: 0 },
    insult: { liking: -4, trust: -1, respect: -3, grudge: 5 },
    threat: { liking: -5, trust: -5, respect: -2, grudge: 7 },
    theft: { liking: -5, trust: -10, respect: -4, grudge: 8 },
    attack: { liking: -7, trust: -6, respect: -3, grudge: 10 },
    help: { liking: 6, trust: 4, respect: 3, grudge: -2 },
    honest_exchange: { liking: 2, trust: 5, respect: 2, grudge: 0 },
}

const reputationChanges: Partial<Record<SocialIncidentKind, SocialReputation>> =
    {
        insult: { honesty: 0, usefulness: -1, danger: 1 },
        threat: { honesty: 0, usefulness: -1, danger: 5 },
        theft: { honesty: -8, usefulness: -2, danger: 3 },
        attack: { honesty: 0, usefulness: -3, danger: 8 },
        help: { honesty: 1, usefulness: 6, danger: 0 },
        honest_exchange: { honesty: 6, usefulness: 2, danger: 0 },
    }

export class SocialScores {
    private readonly relationships = new Map<string, RelationshipState>()
    private readonly reputations = new Map<string, SocialReputation>()

    public relationship(
        observerId: string,
        subjectId: string,
        now?: number,
        resentment = 50
    ): SocialRelationship {
        const state = this.relationships.get(socialKey(observerId, subjectId))
        if (state === undefined) {
            return { ...emptyRelationship }
        }
        return {
            ...state.score,
            grudge: Math.ceil(
                decayGrudge(state, now ?? state.updatedAt, resentment)
            ),
        }
    }

    public reputation(locationId: string, subjectId: string): SocialReputation {
        return {
            ...(this.reputations.get(socialKey(locationId, subjectId)) ??
                emptyReputation),
        }
    }

    public changeRelationship(
        observerId: string,
        subjectId: string,
        kind: SocialIncidentKind,
        strength: number,
        now: number,
        resentment = 50
    ): void {
        const delta = relationshipChanges[kind]
        if (delta === undefined || observerId === subjectId) {
            return
        }
        const key = socialKey(observerId, subjectId)
        const old = this.relationships.get(key) ?? {
            score: emptyRelationship,
            updatedAt: now,
        }
        const updatedAt = Math.max(old.updatedAt, now)
        this.relationships.set(key, {
            updatedAt,
            score: {
                liking: merge(old.score.liking, delta.liking, strength),
                trust: merge(old.score.trust, delta.trust, strength),
                respect: merge(old.score.respect, delta.respect, strength),
                grudge: merge(
                    decayGrudge(old, updatedAt, resentment),
                    delta.grudge,
                    strength,
                    0
                ),
            },
        })
    }

    public changeReputation(
        locationId: string,
        subjectId: string,
        kind: SocialIncidentKind,
        severity: SocialSeverity
    ): void {
        const delta = reputationChanges[kind]
        if (delta === undefined) {
            return
        }
        const old = this.reputation(locationId, subjectId)
        this.reputations.set(socialKey(locationId, subjectId), {
            honesty: merge(old.honesty, delta.honesty, severity),
            usefulness: merge(old.usefulness, delta.usefulness, severity),
            danger: merge(old.danger, delta.danger, severity, 0),
        })
    }
}

export function socialKey(...parts: string[]): string {
    return JSON.stringify(parts)
}

function decayGrudge(
    state: RelationshipState,
    now: number,
    resentment: number
): number {
    const interval = 30_000 + 900 * Math.max(0, Math.min(100, resentment))
    const elapsed = Math.max(0, now - state.updatedAt)
    return Math.max(0, state.score.grudge - elapsed / interval)
}

function merge(
    old: number,
    delta: number,
    strength: number,
    minimum = -100
): number {
    return Math.max(minimum, Math.min(100, old + Math.round(delta * strength)))
}

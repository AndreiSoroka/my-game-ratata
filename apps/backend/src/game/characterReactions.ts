import type { CharacterEmotionSnapshot } from './characterEmotions'
import type { CharacterTraits } from './characterTraits'

export type ReactionTrigger =
    | 'meeting'
    | 'request'
    | 'insult'
    | 'threat'
    | 'theft'
    | 'attack'
    | 'report_news'
    | 'share_news'
    | 'hear_news'

const actions = [
    'greet',
    'talk',
    'help',
    'decline',
    'ignore',
    'warn',
    'attack',
    'flee',
    'report',
    'share',
    'believe',
    'doubt',
    'wait',
] as const

export type ReactionAction = (typeof actions)[number]
export type ReactionWeights = Readonly<Partial<Record<ReactionAction, number>>>
export type ReactionProfile = Readonly<Record<ReactionTrigger, ReactionWeights>>

export interface ReactionContext {
    liking?: number
    trust?: number
    respect?: number
    grudge?: number
    honesty?: number
    usefulness?: number
    danger?: number
    healthFraction?: number
    allies?: number
    threat?: number
    importance?: number
}

export interface ReactionReason {
    incidentId: string
    trigger: ReactionTrigger
    sourceId?: string
}

export interface ReactionRequest extends ReactionReason {
    /** The controller supplies a new revision only after a significant change. */
    revision?: string | number
    available: readonly ReactionAction[]
    severity?: number
    context?: ReactionContext
}

export interface ReactionResult {
    readonly action: ReactionAction
    readonly weights: ReactionWeights
    readonly roll: number
    readonly reason: Readonly<ReactionReason>
}

const baseline: ReactionProfile = {
    meeting: { greet: 55, talk: 15, ignore: 30 },
    request: { help: 35, talk: 20, decline: 25, ignore: 20 },
    insult: { talk: 20, ignore: 35, warn: 32, attack: 8, flee: 5, wait: 3 },
    threat: {
        talk: 8,
        ignore: 5,
        warn: 15,
        attack: 18,
        flee: 37,
        report: 22,
        wait: 8,
    },
    theft: { warn: 30, attack: 20, flee: 20, report: 30 },
    attack: { warn: 5, attack: 45, flee: 30, report: 20 },
    report_news: { report: 45, ignore: 55 },
    share_news: { share: 38, ignore: 62 },
    hear_news: { believe: 42, doubt: 58 },
}

type Modifiers = Readonly<Partial<Record<ReactionAction, number>>>

export function createReactionProfile(
    traits: CharacterTraits
): ReactionProfile {
    const difference = (key: keyof CharacterTraits) => traits[key] - 50
    const modifiers: Modifiers = {
        greet: 0.42 * difference('kindness'),
        talk: 0.35 * difference('selfControl'),
        help: 0.55 * difference('kindness'),
        decline: -0.34 * difference('kindness'),
        warn: 0.42 * difference('temper') + 0.2 * difference('selfControl'),
        attack:
            0.73 * difference('aggression') +
            0.37 * difference('courage') -
            0.23 * difference('selfControl'),
        flee: -0.65 * difference('courage'),
        report:
            0.6 * difference('lawfulness') + 0.19 * difference('newsSharing'),
        share: 0.83 * difference('newsSharing'),
        believe: 0.7 * difference('credulity'),
        doubt: -0.55 * difference('credulity'),
    }
    const profile = {} as Record<ReactionTrigger, ReactionWeights>
    for (const trigger of Object.keys(baseline) as ReactionTrigger[]) {
        profile[trigger] = Object.freeze(modify(baseline[trigger], modifiers))
    }
    return Object.freeze(profile)
}

function modify(
    weights: ReactionWeights,
    modifiers: Modifiers
): ReactionWeights {
    const result: Partial<Record<ReactionAction, number>> = {}
    for (const action of actions) {
        const weight = weights[action]
        if (weight !== undefined) {
            result[action] = Math.max(0, weight + (modifiers[action] ?? 0))
        }
    }
    return result
}

export function reactionWeights(
    profile: ReactionProfile,
    traits: CharacterTraits,
    emotions: CharacterEmotionSnapshot,
    request: ReactionRequest
): ReactionWeights {
    const context = request.context ?? {}
    const anger = emotions.anger.value * (1 - traits.selfControl * 0.006)
    const fear = emotions.fear.value
    const stress = emotions.stress.value
    const grudge = positive(context.grudge)
    const trust = signed(context.trust)
    const respect = signed(context.respect)
    const allies = scale(context.allies, 0, 4, 0)
    const perceivedThreat = positive(context.threat) + positive(context.danger)
    const health = scale(context.healthFraction, 0, 1, 1)
    const vulnerability =
        perceivedThreat * 0.28 + (1 - health) * 36 - allies * 8
    const importance = positive(context.importance)
    const affinity = signed(context.liking) + trust
    const cornered = request.available.includes('flee') ? 0 : fear * 0.46
    const modifiers: Modifiers = {
        greet: affinity * 0.12 - fear * 0.33 - stress * 0.16,
        talk: (trust + respect) * 0.17 - fear * 0.2,
        help:
            affinity * 0.19 +
            signed(context.usefulness) * 0.13 -
            vulnerability * 0.4,
        decline: -affinity * 0.12 + fear * 0.28 + stress * 0.21,
        ignore: stress * 0.1 - importance * 0.21,
        warn: anger * 0.37 + grudge * 0.19 - trust * 0.13 - fear * 0.18,
        attack:
            anger * 0.44 +
            grudge * 0.28 -
            trust * 0.21 -
            vulnerability * 0.48 +
            cornered,
        flee: fear * 0.65 + stress * 0.18 + vulnerability * 0.65,
        report:
            grudge * 0.1 +
            fear * 0.22 +
            vulnerability * 0.18 +
            importance * 0.39,
        share: importance * 0.44 + trust * 0.19 + stress * 0.08,
        believe: importance * 0.14 + (trust + signed(context.honesty)) * 0.28,
        doubt: -trust * 0.23 - signed(context.honesty) * 0.16,
        wait: stress * 0.17,
    }
    return normalizeReactionWeights(
        modify(profile[request.trigger], modifiers),
        request.available
    )
}

export function normalizeReactionWeights(
    weights: ReactionWeights,
    available: readonly ReactionAction[] = actions
): ReactionWeights {
    const valid = actions.filter((action) => available.includes(action))
    const sum = valid.reduce(
        (total, action) => total + positiveWeight(weights[action]),
        0
    )
    if (sum === 0) {
        return Object.freeze({ wait: 100 })
    }
    const normalized: Partial<Record<ReactionAction, number>> = {}
    for (const action of valid) {
        const weight = positiveWeight(weights[action])
        if (weight > 0) {
            normalized[action] = (weight / sum) * 100
        }
    }
    return Object.freeze(normalized)
}

export function pickWeightedReaction(
    weights: ReactionWeights,
    roll: number
): ReactionAction {
    const normalized = normalizeReactionWeights(weights)
    let remaining = reactionRoll(roll) * 100
    let fallback: ReactionAction = 'wait'
    for (const action of actions) {
        const weight = normalized[action]
        if (weight !== undefined) {
            fallback = action
            if (remaining < weight) {
                return action
            }
            remaining -= weight
        }
    }
    return fallback
}

export function reactionRoll(value: number): number {
    return scale(value, 0, 1 - Number.EPSILON, 0)
}

function positiveWeight(value?: number): number {
    return value === undefined || !Number.isFinite(value)
        ? 0
        : Math.max(0, value)
}

function signed(value?: number): number {
    return scale(value, -100, 100, 0)
}

function positive(value?: number): number {
    return scale(value, 0, 100, 0)
}

function scale(
    value: number | undefined,
    lower: number,
    upper: number,
    fallback: number
): number {
    return value === undefined || !Number.isFinite(value)
        ? fallback
        : Math.max(lower, Math.min(upper, value))
}

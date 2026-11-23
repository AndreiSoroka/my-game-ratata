import type { ReactionReason, ReactionTrigger } from './characterReactions'
import type { CharacterTraits } from './characterTraits'

const emotions = ['anger', 'fear', 'stress'] as const
type Emotion = (typeof emotions)[number]

export interface CharacterEmotion {
    readonly value: number
    readonly reason?: Readonly<ReactionReason>
    readonly changedAt?: number
}

export type CharacterEmotionSnapshot = Readonly<
    Record<Emotion, CharacterEmotion>
>

const eventImpulses: Readonly<
    Partial<Record<ReactionTrigger, Record<Emotion, number>>>
> = {
    insult: { anger: 0.59, fear: 0.06, stress: 0.28 },
    threat: { anger: 0.29, fear: 0.75, stress: 0.53 },
    theft: { anger: 0.57, fear: 0.21, stress: 0.41 },
    attack: { anger: 0.68, fear: 0.77, stress: 0.62 },
}

const minorProvocationWindowMs = 30_000
const minorProvocationMaxSeverity = 30

export class CharacterEmotions {
    private readonly latest: Partial<
        Record<Emotion, Required<CharacterEmotion>>
    > = {}
    private readonly recent = new Map<string, { at: number; count: number }>()
    private readonly gain: Readonly<Record<Emotion, number>>
    private readonly decayPerSecond: Readonly<Record<Emotion, number>>

    public constructor(traits: CharacterTraits) {
        this.gain = {
            anger: 0.56 + traits.temper * 0.012,
            fear: 1.37 - traits.courage * 0.009,
            stress: 1.2 - traits.selfControl * 0.006,
        }
        this.decayPerSecond = {
            anger:
                1.35 + traits.selfControl * 0.015 - traits.resentment * 0.009,
            fear: 1.4 + traits.courage * 0.012,
            stress: 0.5 + traits.selfControl * 0.009,
        }
    }

    public snapshot(now: number): CharacterEmotionSnapshot {
        return {
            anger: this.at('anger', now),
            fear: this.at('fear', now),
            stress: this.at('stress', now),
        }
    }

    public observe(
        reason: Readonly<ReactionReason>,
        severity: number,
        now: number
    ): void {
        const impulse = eventImpulses[reason.trigger]
        if (
            impulse === undefined ||
            !Number.isFinite(severity) ||
            severity <= 0
        ) {
            return
        }
        const impact =
            Math.min(100, severity) *
            this.provocationMultiplier(reason, severity, now)
        for (const emotion of emotions) {
            const previous = this.at(emotion, now)
            this.latest[emotion] = {
                value: Math.min(
                    100,
                    previous.value +
                        impulse[emotion] * this.gain[emotion] * impact
                ),
                reason,
                changedAt: Math.max(now, previous.changedAt ?? now),
            }
        }
    }

    private at(emotion: Emotion, now: number): CharacterEmotion {
        const start = this.latest[emotion]
        if (start === undefined) {
            return { value: 0 }
        }
        const seconds = Math.max(0, now - start.changedAt) / 1000
        const value = Math.max(
            0,
            start.value - seconds * this.decayPerSecond[emotion]
        )
        return value === 0 ? { value } : { ...start, value }
    }

    private provocationMultiplier(
        reason: Readonly<ReactionReason>,
        severity: number,
        now: number
    ): number {
        if (
            severity > minorProvocationMaxSeverity ||
            (reason.trigger !== 'insult' && reason.trigger !== 'threat')
        ) {
            return 1
        }
        const key = JSON.stringify([reason.trigger, reason.sourceId ?? ''])
        const previous = this.recent.get(key)
        const count =
            previous !== undefined &&
            now - previous.at <= minorProvocationWindowMs
                ? Math.min(6, previous.count + 1)
                : 0
        this.recent.delete(key)
        this.recent.set(key, { at: now, count })
        for (const [earliest, change] of this.recent) {
            if (now - change.at <= minorProvocationWindowMs) {
                break
            }
            this.recent.delete(earliest)
        }
        return 1 / (count + 1)
    }
}

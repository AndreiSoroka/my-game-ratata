import { THEFT_RULES } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ReactionAction } from './characterReactions'

type Change = 'guard_available' | 'escape_blocked'

interface PendingDecision {
    offender: GameCharacter
    until: number
    eligible: (now: number) => boolean
    paused: (now: number) => boolean
    actions: (now: number) => readonly ReactionAction[]
    decide: (now: number, revision: Change) => void
    previous: readonly ReactionAction[]
    resolved: Set<Change>
}

/** Reconsider an active incident only when a material option changes. */
export class NpcConflictTransitions {
    private readonly pending = new Map<GameCharacter, PendingDecision>()
    private reviewAt = 0

    public clearActor(actor: GameCharacter): void {
        this.pending.delete(actor)
    }

    public watch(
        actor: GameCharacter,
        offender: GameCharacter,
        now: number,
        decision: Pick<
            PendingDecision,
            'eligible' | 'paused' | 'actions' | 'decide'
        >
    ): void {
        this.pending.set(actor, {
            ...decision,
            offender,
            previous: decision.actions(now),
            until: now + THEFT_RULES.retaliationMs,
            resolved: new Set(),
        })
    }

    public clearOffender(offender: GameCharacter): void {
        for (const [actor, decision] of this.pending) {
            if (decision.offender === offender) {
                this.pending.delete(actor)
            }
        }
    }

    public update(now: number, busy: (actor: GameCharacter) => boolean): void {
        if (now < this.reviewAt || this.pending.size === 0) {
            return
        }
        this.reviewAt = now + 500
        for (const [actor, decision] of this.pending) {
            if (now >= decision.until || !decision.eligible(now)) {
                this.pending.delete(actor)
            } else if (!busy(actor) && !decision.paused(now)) {
                const current = decision.actions(now)
                const change = changedAffordances(decision, current)
                decision.previous = current
                if (change !== undefined) {
                    decision.resolved.add(change)
                    decision.decide(now, change)
                }
            }
        }
    }
}

function changedAffordances(
    decision: PendingDecision,
    current: readonly ReactionAction[]
): Change | undefined {
    const arrived =
        !decision.previous.includes('report') && current.includes('report')
    const blocked =
        decision.previous.includes('flee') && !current.includes('flee')
    if (arrived && !decision.resolved.has('guard_available')) {
        if (blocked) {
            decision.resolved.add('escape_blocked')
        }
        return 'guard_available'
    }
    return blocked && !decision.resolved.has('escape_blocked')
        ? 'escape_blocked'
        : undefined
}

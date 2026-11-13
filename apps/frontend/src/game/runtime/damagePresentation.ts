import type { GameEventPayload } from '@my-game-ratata/contracts'

export const hurtPoseMs = 240
export const hitFlashMs = 120
export const damageNumberMs = 850
export const maxDamageEffects = 24
export interface DamageHit {
    id: number
    targetId: string
    amount: number
    startedAt: number
}

// Presentation only: no HP, position, combat timing or server animation is changed.
export class DamageTimeline {
    private readonly hits = new Map<string, DamageHit>()
    private nextId = 0

    public receive(
        event: GameEventPayload,
        now: number,
        targetVisible: boolean
    ): DamageHit | undefined {
        if (
            event.kind !== 'damage' ||
            !targetVisible ||
            typeof event.targetId !== 'string' ||
            typeof event.amount !== 'number' ||
            !Number.isFinite(event.amount) ||
            event.amount <= 0
        ) {
            return undefined
        }
        const hit = {
            id: ++this.nextId,
            targetId: event.targetId,
            amount: event.amount,
            startedAt: now,
        }
        this.hits.delete(hit.targetId)
        this.hits.set(hit.targetId, hit)
        if (this.hits.size > maxDamageEffects) {
            const oldest = this.hits.keys().next().value
            if (oldest !== undefined) this.hits.delete(oldest)
        }
        return hit
    }

    public elapsed(targetId: string, now: number): number | undefined {
        const hit = this.hits.get(targetId)
        if (hit === undefined) return undefined
        const elapsed = now - hit.startedAt
        return elapsed >= 0 && elapsed < hurtPoseMs ? elapsed : undefined
    }

    public forget(targetId: string): void {
        this.hits.delete(targetId)
    }
    public clear(): void {
        this.hits.clear()
    }
}

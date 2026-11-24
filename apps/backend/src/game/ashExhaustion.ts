import { ASH_RULES, type AshExhaustionRank } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { hasAttackRelationship } from './combatTargets'
import { effectiveMaxEnergy, effectiveMaxMana } from './effectiveResources'
import { reconcileResourceCapacity } from './resourcePractice'

interface ExhaustionCurse {
    rank: AshExhaustionRank
    expiresAt: number
    cappedHpLoss: number
}

const curses = new WeakMap<GameCharacter, ExhaustionCurse>()

export function snapshotAshExhaustion(
    actor: GameCharacter,
    now: number
): Pick<ExhaustionCurse, 'rank' | 'expiresAt'> | undefined {
    const curse = curses.get(actor)
    return actor.alive && curse !== undefined && curse.expiresAt > now
        ? { rank: curse.rank, expiresAt: curse.expiresAt }
        : undefined
}

export function ashExhaustionCapacity(actor: GameCharacter): number {
    const curse = curses.get(actor)
    return curse === undefined
        ? 1
        : 1 - ASH_RULES.exhaustion.reductions[(curse.rank - 1) as 0 | 1 | 2]
}

export function clearAshExhaustion(actor: GameCharacter): void {
    const curse = curses.get(actor)
    if (curse === undefined) {
        return
    }
    curses.delete(actor)
    if (actor.alive) {
        actor.abilities.untrainableHpDamage = Math.min(
            Math.max(0, actor.maxHp - actor.hp),
            actor.abilities.untrainableHpDamage + curse.cappedHpLoss
        )
        reconcileResources(actor)
    }
}

export function expireAshExhaustion(actor: GameCharacter, now: number): void {
    const curse = curses.get(actor)
    if (curse !== undefined && curse.expiresAt <= now) {
        clearAshExhaustion(actor)
    }
}

export function curseWithAshExhaustion(
    actor: GameCharacter,
    rank: AshExhaustionRank,
    now: number
): number | undefined {
    expireAshExhaustion(actor, now)
    const active = curses.get(actor)
    if (!actor.alive || (active !== undefined && active.rank > rank)) {
        return undefined
    }
    const expiresAt = now + ASH_RULES.exhaustion.durationMs
    const curse = { rank, expiresAt, cappedHpLoss: active?.cappedHpLoss ?? 0 }
    curses.set(actor, curse)
    curse.cappedHpLoss += Math.max(0, actor.hp - actor.maxHp)
    actor.hp = Math.min(actor.hp, actor.maxHp)
    actor.mana = Math.min(actor.mana, effectiveMaxMana(actor))
    actor.energy = Math.min(actor.energy, effectiveMaxEnergy(actor))
    reconcileResources(actor)
    return expiresAt
}

export function ashExhaustionHostile(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    sameParty?: (firstId: string, secondId: string) => boolean
): boolean {
    return (
        actor !== target &&
        target.trainingTarget === undefined &&
        sameParty?.(actor.id, target.id) !== true &&
        hasAttackRelationship(actor, target, now)
    )
}

function reconcileResources(actor: GameCharacter): void {
    reconcileResourceCapacity(actor, 'mana')
    reconcileResourceCapacity(actor, 'energy')
}

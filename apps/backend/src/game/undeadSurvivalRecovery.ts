import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveMaxEnergy } from './effectiveResources'
import { recordResourceSpend, restoreEnergy } from './resourcePractice'
import {
    hasUndeadImprint,
    undeadImprintBonus,
    undeadSurvivalLife,
} from './undeadSurvivalState'
import { recordVitalityRecovery } from './vitalityPractice'

export function undeadEnergyRecoveryMultiplier(actor: GameCharacter): number {
    const opened = actor.progression.constellations.opened
    const emptyVeins =
        opened.has('undead.empty_veins') &&
        actor.energy < effectiveMaxEnergy(actor) * 0.25
            ? 0.4
            : 0
    return 1 + emptyVeins + undeadImprintBonus(actor, 'recovery')
}

export function repairRestingUndead(
    actor: GameCharacter,
    moving: boolean,
    now: number,
    deltaMs: number
): GameEventPayload[] {
    if (!actor.progression.constellations.opened.has('undead.reassembly')) {
        return []
    }
    const life = undeadSurvivalLife(actor)
    if (!undeadAtRest(actor, moving, now)) {
        delete life.repairRestSince
        return []
    }
    life.repairRestSince ??= now - deltaMs
    const eligibleMs = Math.min(
        deltaMs,
        Math.max(0, now - life.repairRestSince - 6000)
    )
    const recovered = Math.min(
        eligibleMs / 1000,
        Math.max(0, actor.maxHp * 0.6 - actor.hp),
        actor.energy / 2
    )
    if (recovered <= 0) {
        return []
    }
    recordResourceSpend(actor, 'energy', actor.drainEnergy(recovered * 2))
    return mend(actor, recovered, now)
}

function undeadAtRest(actor: GameCharacter, moving: boolean, now: number) {
    return (
        !moving &&
        actor.combat.recentDamageUntil <= now &&
        actor.combat.readyAt <= now &&
        !actor.combat.defensiveStance &&
        actor.stunUntil <= now &&
        actor.pendingAttack === undefined &&
        actor.abilities.casting === null &&
        !actor.isActionLocked(now) &&
        !actor.tags.has('offline')
    )
}

export function recoverAfterUndeadKill(
    actor: GameCharacter,
    victimLevel: number,
    now: number
): GameEventPayload[] {
    const opened = actor.progression.constellations.opened
    const events: GameEventPayload[] = []
    if (
        opened.has('undead.collapse2') &&
        undeadSurvivalLife(actor).collapses === 1
    ) {
        undeadSurvivalLife(actor).secondCollapseReady = true
    }
    const feast = opened.has('undead.grim_feast')
    const oath = fulfillOath(actor, victimLevel)
    if (!feast && !oath) {
        return events
    }
    const recoveredHp = (feast ? 12 : 0) + (oath ? actor.maxHp * 0.25 : 0)
    const recoveredEnergy =
        (feast ? 30 : 0) + (oath ? effectiveMaxEnergy(actor) * 0.25 : 0)
    const healed = Math.min(Math.max(0, actor.maxHp - actor.hp), recoveredHp)
    if (healed > 0) {
        events.push(...mend(actor, healed, now), {
            kind: 'heal',
            actorId: actor.id,
            targetId: actor.id,
            amount: healed,
        })
    }
    events.push(...restoreEnergy(actor, recoveredEnergy, now).events)
    return events
}

function fulfillOath(actor: GameCharacter, victimLevel: number): boolean {
    if (
        !actor.progression.constellations.opened.has('undead.second_oath') ||
        !hasUndeadImprint(actor) ||
        victimLevel * 2 < actor.progression.masteries.undead.level
    ) {
        return false
    }
    const life = undeadSurvivalLife(actor)
    if (life.oathFulfilled) {
        return false
    }
    life.oathFulfilled = true
    return true
}

function mend(
    actor: GameCharacter,
    amount: number,
    now: number
): GameEventPayload[] {
    actor.hp += amount
    actor.abilities.untrainableHpDamage = Math.min(
        actor.abilities.untrainableHpDamage,
        Math.max(0, actor.maxHp - actor.hp)
    )
    return recordVitalityRecovery(actor, amount, now)
}

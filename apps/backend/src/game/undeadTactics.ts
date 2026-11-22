import type { DamageKind, PrayerActionId } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import type { AttackContext } from './combat'
import { attackDelivery } from './combatDefense'
import { undeadArrowArmor } from './constellationUndead'
import { UNDEAD_ARROW_CATCH_CHANCE } from './constellationUndeadTacticsStars'
import { canTargetByFaction } from './factions'
import { distance } from './math'

interface UndeadDefenseState {
    life: number
    arrowReadyAt: number
    caughtArrowUntil: number
    ashReadyAt: number
}
interface BoneMark {
    locationId: string
    life: number
    sourceId: string
    faction: GameCharacter['faction']
    until: number
}

const protection = new WeakMap<GameCharacter, UndeadDefenseState>()
const marks = new WeakMap<GameCharacter, BoneMark>()

export function undeadContactMultiplier(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter,
    random: () => number
): number {
    const { actor, now } = context
    if (
        (actor.archetype !== 'skeleton' && target.archetype !== 'skeleton') ||
        !target.alive ||
        target.trainingTarget !== undefined ||
        actor.faction === target.faction ||
        !canTargetByFaction(actor, target, now)
    ) {
        return 1
    }
    const delivery = attackDelivery(attack)
    if (delivery === 'melee_physical') {
        const state = protection.get(actor)
        if (
            state?.life === actor.deathSequence &&
            state.caughtArrowUntil > now
        ) {
            state.caughtArrowUntil = 0
            return 1.2
        }
    }
    return delivery === 'ranged_physical'
        ? formationMultiplier(context, target) * catchArrow(target, now, random)
        : 1
}

function formationMultiplier(
    context: AttackContext,
    target: GameCharacter
): number {
    if (!hasTactic(target, 'bone_rank')) {
        return 1
    }
    let allies = 0
    for (const ally of context.targets) {
        if (inBoneFormation(ally, target, context)) {
            allies += 1
            if (allies === 3) {
                break
            }
        }
    }
    const ribs = undeadArrowArmor(target.progression.constellations.opened)
    return (ribs - allies * 0.05) / ribs
}

function inBoneFormation(
    ally: GameCharacter,
    target: GameCharacter,
    context: AttackContext
): boolean {
    return (
        ally !== target &&
        ally.alive &&
        ally.trainingTarget === undefined &&
        !ally.tags.has('offline') &&
        ally.creatureType === 'undead' &&
        ally.faction === target.faction &&
        ally.locationId === target.locationId &&
        distance(ally.position, target.position) <= 2 * context.tileSize &&
        (context.navigation?.hasLineOfSight(ally.position, target.position) ??
            true)
    )
}

function catchArrow(
    target: GameCharacter,
    now: number,
    random: () => number
): number {
    if (!hasTactic(target, 'arrow_catch')) {
        return 1
    }
    const state = defenseState(target)
    if (now < state.arrowReadyAt || random() >= UNDEAD_ARROW_CATCH_CHANCE) {
        return 1
    }
    state.arrowReadyAt = now + 4_000
    state.caughtArrowUntil = state.arrowReadyAt
    return 0.5
}

export function markUndeadContact(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number
): void {
    if (
        attack.abilityId === 'skeleton_strike' &&
        target.alive &&
        hasTactic(actor, 'rattle')
    ) {
        marks.set(target, {
            locationId: target.locationId,
            life: target.deathSequence,
            sourceId: actor.id,
            faction: actor.faction,
            until: now + 3_000,
        })
    }
}

/** Called once per lawful hostile damage resolution, before the final rounding. */
export function undeadDamageMultiplier(
    actor: GameCharacter,
    target: GameCharacter,
    kind: DamageKind,
    now: number
): number {
    const mark = marks.get(target)
    const markedDamage =
        mark?.life === target.deathSequence &&
        mark.locationId === target.locationId &&
        mark.sourceId !== actor.id &&
        mark.faction === actor.faction &&
        actor.creatureType === 'undead' &&
        now < mark.until
            ? 1.1
            : 1
    if (kind !== 'holy' || !hasTactic(target, 'ash_crust')) {
        return markedDamage
    }
    const state = defenseState(target)
    if (now < state.ashReadyAt) {
        return markedDamage
    }
    state.ashReadyAt = now + 20_000
    return markedDamage * 0.75
}

export function undeadHearingMultiplier(
    listener: GameCharacter,
    source: GameCharacter
): number {
    if (
        listener.archetype !== 'skeleton' ||
        source.movement.mode !== 'sneaking' ||
        !hasTactic(listener, 'hollow_sight')
    ) {
        return 1
    }
    return hasTactic(listener, 'night_watch') &&
        listener.velocity.x === 0 &&
        listener.velocity.y === 0
        ? 2.4
        : 1.6
}

export function receivesDustKin(
    actor: GameCharacter,
    target: GameCharacter,
    ability: PrayerActionId
): boolean {
    return (
        ability === 'pray_grave' &&
        actor !== target &&
        hasTactic(target, 'dust_kin')
    )
}

export function dustPrayerQuality(
    actor: GameCharacter,
    target: GameCharacter,
    ability: PrayerActionId,
    quality: number
): number {
    return quality * (receivesDustKin(actor, target, ability) ? 1.4 : 1)
}

function hasTactic(actor: GameCharacter, id: string): boolean {
    return actor.progression.constellations.opened.has(`undead.${id}`)
}

function defenseState(actor: GameCharacter): UndeadDefenseState {
    const state = protection.get(actor)
    if (state?.life === actor.deathSequence) {
        return state
    }
    const next = {
        life: actor.deathSequence,
        arrowReadyAt: 0,
        caughtArrowUntil: 0,
        ashReadyAt: 0,
    }
    protection.set(actor, next)
    return next
}

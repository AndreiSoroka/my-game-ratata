import type {
    PrayerActionId,
    PrayerIntent,
    Vector2,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { constellationModifiers } from './constellationModifiers'
import { canPurifyGrave } from './gravePrayer'
import { distance } from './math'
import { prayerTargetNearby, validPrayerIntent } from './prayerContext'

export interface MotherPrayerTarget {
    kind: 'restore' | 'revive' | 'harm' | 'ward' | 'purify_grave'
    id: string
}
export interface MotherTargetSelection {
    ordered: MotherPrayerTarget[]
    chosen: MotherPrayerTarget | undefined
}
export interface MotherTargetBudget {
    mana: number
    maxMana: number
    lastLight: boolean
    selfId: string
    limit: number
}

/** Candidate priority is stable: fallen allies, living allies, self, undead, then graves. */
export function motherPrayerCandidates(
    actor: GameCharacter,
    context: AbilityContext,
    action: PrayerActionId
): MotherPrayerTarget[] {
    const ordered = [
        ...new Map(
            [...context.characters, actor].map((target) => [target.id, target])
        ).values(),
    ].sort((a, b) => byDistance(actor.position, a, b))
    const targets = [
        ...allyTargets(actor, context, action, ordered, 'revive'),
        ...allyTargets(actor, context, action, ordered, 'restore'),
    ]
    if (
        validPrayerIntent(
            actor,
            { mode: 'restore', targetId: actor.id },
            context,
            action
        )
    ) {
        targets.push({ kind: 'restore', id: actor.id })
    }
    return [
        ...targets,
        ...undeadTargets(actor, context, action, ordered),
        ...graveTargets(actor, context),
    ]
}

export function selectMotherPrayerTargets(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    action: PrayerActionId,
    lastLight: boolean
): MotherTargetSelection | undefined {
    const candidates = motherPrayerCandidates(actor, context, action)
    const chosen = targetForIntent(intent, candidates)
    if (!chosenTargetPerceives(actor, intent, context, chosen)) {
        return undefined
    }
    if (intent.mode !== 'devotion' && chosen === undefined) {
        return undefined
    }
    const ordered: MotherPrayerTarget[] = []
    if (lastLight) {
        const self = candidates.find(
            (target) => target.kind === 'restore' && target.id === actor.id
        )
        if (self === undefined) {
            return undefined
        }
        ordered.push(self)
    }
    const mixed = action === 'pray_woven'
    const kind = lastLight ? 'restore' : chosen?.kind
    appendChosenTarget(ordered, chosen, kind, mixed)
    if (intent.mode !== 'devotion' || lastLight) {
        ordered.push(
            ...candidates.filter((target) => mixed || target.kind === kind)
        )
    }
    return { ordered, chosen }
}

function appendChosenTarget(
    ordered: MotherPrayerTarget[],
    chosen: MotherPrayerTarget | undefined,
    kind: MotherPrayerTarget['kind'] | undefined,
    mixed: boolean
): void {
    if (chosen !== undefined && (mixed || chosen.kind === kind)) {
        ordered.push(chosen)
    }
}

/** Read-only affordable target allocation; an unaffordable mandatory self-heal rejects the action. */
export function affordableMotherPrayerTargets(
    ordered: readonly MotherPrayerTarget[],
    budget: MotherTargetBudget
): { targets: MotherPrayerTarget[]; manaCost: number } | undefined {
    const targets: MotherPrayerTarget[] = []
    const seen = new Set<string>()
    let remaining = budget.mana
    let manaCost = 0
    for (const target of ordered) {
        if (targets.length >= budget.limit) {
            break
        }
        const key = `${target.kind === 'purify_grave' ? 'grave' : 'character'}:${target.id}`
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        const cost =
            budget.lastLight && target.kind === 'restore'
                ? budget.maxMana * 0.3
                : 5
        if (remaining + 1e-9 < cost) {
            if (budget.lastLight && target.id === budget.selfId) {
                return undefined
            }
            continue
        }
        remaining -= cost
        manaCost += cost
        targets.push(target)
    }
    return { targets, manaCost }
}

function allyTargets(
    actor: GameCharacter,
    context: AbilityContext,
    action: PrayerActionId,
    ordered: readonly GameCharacter[],
    kind: 'restore' | 'revive'
): MotherPrayerTarget[] {
    return ordered
        .filter(
            (target) =>
                !(kind === 'restore' && target.id === actor.id) &&
                validPrayerIntent(
                    actor,
                    { mode: kind, targetId: target.id },
                    context,
                    action
                )
        )
        .map((target) => ({ kind, id: target.id }))
}
function undeadTargets(
    actor: GameCharacter,
    context: AbilityContext,
    action: PrayerActionId,
    ordered: readonly GameCharacter[]
): MotherPrayerTarget[] {
    const harm = actor.progression.constellations.opened.has('prayer.harm')
    if (!harm && constellationModifiers(actor).prayerWardRank <= 0) {
        return []
    }
    return ordered
        .filter(
            (target) =>
                target.id !== actor.id &&
                target.alive &&
                target.creatureType === 'undead' &&
                prayerTargetNearby(actor, target, context, action)
        )
        .map((target) => ({ kind: harm ? 'harm' : 'ward', id: target.id }))
}
function graveTargets(
    actor: GameCharacter,
    context: AbilityContext
): MotherPrayerTarget[] {
    return (context.graves?.list(actor.locationId) ?? [])
        .filter((grave) => canPurifyGrave(actor, grave.id, context))
        .sort((a, b) => byDistance(actor.position, a, b))
        .map((grave) => ({ kind: 'purify_grave', id: grave.id }))
}
function byDistance(
    origin: Vector2,
    a: { id: string; position: Vector2 },
    b: { id: string; position: Vector2 }
): number {
    const delta = distance(origin, a.position) - distance(origin, b.position)
    return delta === 0 ? a.id.localeCompare(b.id) : delta
}
function targetForIntent(
    intent: PrayerIntent,
    candidates: readonly MotherPrayerTarget[]
): MotherPrayerTarget | undefined {
    if (intent.mode === 'devotion') {
        return undefined
    }
    const id =
        intent.mode === 'purify_grave' ? intent.target.id : intent.targetId
    return candidates.find(
        (target) =>
            target.kind === intent.mode &&
            (id === undefined || target.id === id)
    )
}
function chosenTargetPerceives(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    chosen: MotherPrayerTarget | undefined
): boolean {
    if (chosen === undefined || chosen.kind === 'purify_grave') {
        return true
    }
    const target = context.characters.find(
        (candidate) => candidate.id === chosen.id
    )
    return (
        target === undefined ||
        intent.targetId === undefined ||
        canObserveRoomCharacter(actor, target, context.navigation, context.now)
    )
}

import { type PrayerIntent, type PrayerMode, prayerSchoolId } from './abilities'
import type { WorldGraveSnapshot } from './graves'
import type { CharacterSnapshot } from './index'
import { PRAYER_SCHOOL_DEFINITIONS } from './prayer'
import type { PreviewContext } from './prayerPreviewTypes'
import { resourceNeedsRestoration } from './resources'
export type { PrayerPreviewOptions, PreviewContext } from './prayerPreviewTypes'

const devotion = Object.freeze({ mode: 'devotion' as const })

export function choosePrayerPreviewTargets(
    context: PreviewContext,
    selectedId?: string
) {
    const undead = harmTargets(context)
    const selected = chooseIntent(context, undead, selectedId) ?? devotion
    const intent = forcedSelfIntent(context, selected, selectedId)
    const targets = previewTargets(context, intent, undead, selected)
    const harmed = context.parameters.harm
        ? targets
              .filter((entry) => entry.mode === 'harm')
              .flatMap((entry) =>
                  context.all.filter((target) => target.id === entry.id)
              )
        : []
    return { intent, targets, harmed }
}
function forcedSelfIntent(
    context: PreviewContext,
    selected: PrayerIntent,
    selectedId?: string
): PrayerIntent {
    if (
        (context.parameters.cost?.healingManaFraction ?? 0) <= 0 ||
        context.abilityId === 'pray_woven'
    ) {
        return selected
    }
    if (selectedId !== undefined && selected.mode === 'devotion') {
        return selected
    }
    return eligibleGift(context, context.player, 'restore')
        ? { mode: 'restore', targetId: context.player.id }
        : selected
}
function distance(
    context: PreviewContext,
    target: Pick<CharacterSnapshot, 'position'>
): number {
    return Math.hypot(
        context.player.position.x - target.position.x,
        context.player.position.y - target.position.y
    )
}
function nearby(context: PreviewContext, target: CharacterSnapshot): boolean {
    return (
        !target.tags.includes('offline') &&
        target.life?.retired !== true &&
        distance(context, target) <= context.parameters.radius &&
        (target.id === context.player.id ||
            (context.options.canReach?.(target) ?? true))
    )
}
function resourceMissing(
    context: PreviewContext,
    target: CharacterSnapshot
): boolean {
    if (context.profile.resource === 'hp') {
        return target.health.kind === 'exact'
            ? target.health.current < target.health.max
            : target.health.percent < 100
    }
    return resourceNeedsRestoration(target.resources[context.profile.resource])
}
function eligibleGift(
    context: PreviewContext,
    target: CharacterSnapshot,
    mode: 'restore' | 'revive'
): boolean {
    const ally =
        target.id === context.player.id ||
        (context.options.canAid?.(target) ??
            target.faction === context.player.faction)
    if (!nearby(context, target) || !ally) {
        return false
    }
    if (mode === 'revive') {
        return eligibleRevival(context, target)
    }
    return (
        target.alive &&
        context.profile.restoreTypes.includes(target.creatureType) &&
        resourceMissing(context, target)
    )
}
function harmTargets(context: PreviewContext): CharacterSnapshot[] {
    if (!context.parameters.harm && (context.parameters.wardRank ?? 0) <= 0) {
        return []
    }
    return context.all
        .filter(
            (target) =>
                target.alive &&
                nearby(context, target) &&
                context.profile.harmTypes.includes(target.creatureType)
        )
        .sort((a, b) => distanceOrder(context, a, b))
}
function chooseIntent(
    context: PreviewContext,
    harmed: CharacterSnapshot[],
    selectedId: string | undefined
): PrayerIntent | undefined {
    if (selectedId !== undefined) {
        return selectedIntent(context, harmed, selectedId)
    }
    const ordered = context.all
        .filter((target) => target.id !== context.player.id)
        .sort((a, b) => {
            const delta = distance(context, a) - distance(context, b)
            return delta === 0 ? a.id.localeCompare(b.id) : delta
        })
    for (const mode of ['revive', 'restore'] as const) {
        const target = ordered.find((candidate) =>
            eligibleGift(context, candidate, mode)
        )
        if (target !== undefined) {
            return { mode, targetId: target.id }
        }
    }
    if (eligibleGift(context, context.player, 'restore')) {
        return { mode: 'restore', targetId: context.player.id }
    }
    const undead = harmed[0]
    if (undead !== undefined) {
        return {
            mode: context.parameters.harm ? 'harm' : 'ward',
            targetId: undead.id,
        }
    }
    const grave = nearbyGraves(context).sort((a, b) => {
        const delta = distance(context, a) - distance(context, b)
        return delta === 0 ? a.id.localeCompare(b.id) : delta
    })[0]
    if (grave !== undefined) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } }
    }
    return undefined
}
function selectedIntent(
    context: PreviewContext,
    harmed: CharacterSnapshot[],
    selectedId: string
): PrayerIntent | undefined {
    const grave = nearbyGraves(context).find(
        (candidate) => candidate.id === selectedId
    )
    if (grave !== undefined) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } }
    }
    const target = context.all.find((candidate) => candidate.id === selectedId)
    if (target === undefined) {
        return undefined
    }
    for (const mode of ['revive', 'restore'] as const) {
        if (eligibleGift(context, target, mode)) {
            return { mode, targetId: target.id }
        }
    }
    return harmed.some((candidate) => candidate.id === selectedId)
        ? {
              mode: context.parameters.harm ? 'harm' : 'ward',
              targetId: selectedId,
          }
        : undefined
}

interface PreviewTarget {
    id: string
    mode: Exclude<PrayerMode, 'devotion'>
}
/** A bounded visible preview; authoritative affordability and eligibility are rechecked on the server. */
type AddPreviewTarget = (id: string, mode: PreviewTarget['mode']) => void
function previewTargets(
    context: PreviewContext,
    intent: PrayerIntent,
    harmed: CharacterSnapshot[],
    selected: PrayerIntent
): PreviewTarget[] {
    if (intent.mode === 'devotion') {
        return []
    }
    const result: PreviewTarget[] = []
    const add: AddPreviewTarget = (id, mode) => {
        if (!result.some((entry) => entry.id === id)) {
            result.push({ id, mode })
        }
    }
    if (
        (context.parameters.cost?.healingManaFraction ?? 0) > 0 &&
        eligibleGift(context, context.player, 'restore')
    ) {
        add(context.player.id, 'restore')
    }
    addPrimaryTarget(intent, harmed, add)
    if (context.abilityId === 'pray_woven' || selected.mode === intent.mode) {
        addPrimaryTarget(selected, harmed, add)
    }
    addAdditionalTargets(context, harmed, add)
    const matching =
        context.abilityId === 'pray_woven'
            ? result
            : result.filter((target) => target.mode === intent.mode)
    return matching.slice(
        0,
        context.parameters.targetLimit ??
            (context.abilityId === 'pray_woven' ? 2 : 1)
    )
}
function addPrimaryTarget(
    intent: Exclude<PrayerIntent, { mode: 'devotion' }>,
    harmed: CharacterSnapshot[],
    add: AddPreviewTarget
): void {
    if (intent.mode === 'devotion') {
        return
    }
    if (intent.mode === 'purify_grave') {
        add(intent.target.id, intent.mode)
    } else if (intent.targetId !== undefined) {
        add(intent.targetId, intent.mode)
    } else if (
        (intent.mode === 'harm' || intent.mode === 'ward') &&
        harmed[0] !== undefined
    ) {
        add(harmed[0].id, intent.mode)
    }
}
function addAdditionalTargets(
    context: PreviewContext,
    harmed: CharacterSnapshot[],
    add: AddPreviewTarget
): void {
    const ordered = [...context.all]
        .filter((target) => target.id !== context.player.id)
        .sort((a, b) => distanceOrder(context, a, b))
    for (const mode of ['revive', 'restore'] as const) {
        for (const target of ordered) {
            if (eligibleGift(context, target, mode)) {
                add(target.id, mode)
            }
        }
    }
    if (eligibleGift(context, context.player, 'restore')) {
        add(context.player.id, 'restore')
    }
    for (const target of harmed) {
        add(target.id, context.parameters.harm ? 'harm' : 'ward')
    }
    for (const target of nearbyGraves(context)) {
        add(target.id, 'purify_grave')
    }
}
function distanceOrder(
    context: PreviewContext,
    a: CharacterSnapshot,
    b: CharacterSnapshot
): number {
    const delta = distance(context, a) - distance(context, b)
    return delta !== 0 ? delta : a.id.localeCompare(b.id)
}
function eligibleRevival(
    context: PreviewContext,
    target: CharacterSnapshot
): boolean {
    return (
        !target.alive &&
        (target.life?.reviveMsLeft ?? 0) > 0 &&
        (context.player.progression?.resurrectionSchools?.includes(
            prayerSchoolId(context.abilityId)
        ) === true ||
            (prayerSchoolId(context.abilityId) === 'pray' &&
                context.player.progression?.resurrectionUnlocked === true)) &&
        context.profile.reviveTypes.includes(target.creatureType)
    )
}

function nearbyGraves(context: PreviewContext): WorldGraveSnapshot[] {
    if (
        !PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(context.abilityId)].canPurify
    ) {
        return []
    }
    return [...(context.options.graves ?? [])].filter(
        (grave) =>
            context.player.abilities?.known.includes(context.abilityId) ===
                true &&
            grave.phase !== 'purified' &&
            Math.hypot(
                grave.position.x - context.player.position.x,
                grave.position.y - context.player.position.y
            ) <= context.parameters.radius &&
            (context.options.canReachGrave?.(grave) ?? true)
    )
}

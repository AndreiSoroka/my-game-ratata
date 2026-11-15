import {
    type PrayerAbilityId,
    type PrayerIntent,
    type PrayerMode,
    type PrayerParametersSnapshot,
    type PrayerPreview,
} from './abilities'
import { ABILITY_DEFINITIONS } from './abilities'
import { type WorldGraveSnapshot } from './graves'
import type { CharacterSnapshot } from './index'
import {
    type DeityPrayerProfile,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerManaCost,
    profileForPrayer,
} from './prayer'
import { resourceNeedsRestoration } from './resources'
export interface PrayerPreviewOptions {
    abilityId?: PrayerAbilityId
    canReach?: (target: CharacterSnapshot) => boolean
    canAid?: (target: CharacterSnapshot) => boolean
    graves?: readonly WorldGraveSnapshot[]
    canReachGrave?: (target: WorldGraveSnapshot) => boolean
}
interface PreviewContext {
    player: CharacterSnapshot
    abilityId: PrayerAbilityId
    parameters: PrayerParametersSnapshot
    all: CharacterSnapshot[]
    profile: DeityPrayerProfile
    options: PrayerPreviewOptions
}
/** Presentation preview only. The server revalidates the pinned intent before spending. */
export function previewPrayerFromSnapshots(
    player: CharacterSnapshot,
    characters: readonly CharacterSnapshot[],
    selectedTargetId?: string,
    options: PrayerPreviewOptions = {}
): PrayerPreview {
    const abilityId = options.abilityId ?? 'pray'
    const context: PreviewContext = {
        player,
        abilityId,
        parameters: snapshotPrayerParameters(player, abilityId),
        options,
        profile: profileForPrayer(abilityId),
        all: [
            ...new Map(
                [...characters, player].map((target) => [target.id, target])
            ).values(),
        ],
    }
    if (
        selectedTargetId !== undefined &&
        options.graves?.some((grave) => grave.id === selectedTargetId) ===
            true &&
        !PRAYER_SCHOOL_DEFINITIONS[abilityId].canPurify
    ) {
        return {
            abilityId,
            intent: null,
            manaCost: context.parameters.manaCost,
            radius: context.parameters.radius,
            durationMs: context.parameters.durationMs,
            harmfulTargets: 0,
            includesSelf: false,
            includesAllies: false,
            unavailableReason: 'Эта молитва не очищает могилы.',
        }
    }
    const possibleHarm = harmTargets(context)
    const intent: PrayerIntent = chooseIntent(
        context,
        possibleHarm,
        selectedTargetId
    ) ?? { mode: 'devotion' }
    const harmed = intent.mode === 'devotion' ? [] : possibleHarm
    const manaCost =
        intent.mode === 'devotion' || intent.mode === 'revive'
            ? prayerManaCost(intent.mode)
            : context.parameters.manaCost
    return {
        abilityId,
        intent,
        manaCost,
        ...previewParameters(context, intent.mode),
        harmfulTargets: harmed.length,
        includesSelf: harmed.some((target) => target.id === player.id),
        includesAllies: harmed.some(
            (target) =>
                target.id !== player.id && target.faction === player.faction
        ),
        unavailableReason: unavailableReason(player, intent.mode, abilityId),
    }
}
function creatureType(target: CharacterSnapshot) {
    return target.creatureType
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
        context.profile.restoreTypes.includes(creatureType(target)) &&
        resourceMissing(context, target)
    )
}
function harmTargets(context: PreviewContext): CharacterSnapshot[] {
    if (!context.parameters.harm) {
        return []
    }
    return context.all.filter(
        (target) =>
            target.alive &&
            nearby(context, target) &&
            context.profile.harmTypes.includes(creatureType(target))
    )
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
    const grave = nearbyGraves(context).sort((a, b) => {
        const delta = distance(context, a) - distance(context, b)
        return delta === 0 ? a.id.localeCompare(b.id) : delta
    })[0]
    if (grave !== undefined) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } }
    }
    return harmed.length > 0 ? { mode: 'harm' } : undefined
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
        ? { mode: 'harm', targetId: selectedId }
        : undefined
}
function unavailableReason(
    player: CharacterSnapshot,
    mode: PrayerMode,
    abilityId: PrayerAbilityId
): string | null {
    if (player.abilities?.known.includes(abilityId) !== true) {
        return 'Молитва не изучена.'
    }
    if (
        !player.alive ||
        player.cooldowns.stunMsLeft > 0 ||
        player.abilities.casting !== null
    ) {
        return 'Персонаж не может молиться сейчас.'
    }
    if ((player.abilities.cooldowns[abilityId] ?? 0) > 0) {
        return 'Молитва восстанавливается.'
    }
    return player.resourceChecks?.prayers[abilityId][mode] === 'ready'
        ? null
        : 'Недостаточно маны.'
}

function eligibleRevival(
    context: PreviewContext,
    target: CharacterSnapshot
): boolean {
    return (
        !target.alive &&
        (target.life?.reviveMsLeft ?? 0) > 0 &&
        (context.player.progression?.resurrectionSchools?.includes(
            context.abilityId
        ) === true ||
            (context.abilityId === 'pray' &&
                context.player.progression?.resurrectionUnlocked === true)) &&
        context.profile.reviveTypes.includes(creatureType(target))
    )
}

function nearbyGraves(context: PreviewContext): WorldGraveSnapshot[] {
    if (!PRAYER_SCHOOL_DEFINITIONS[context.abilityId].canPurify) {
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

function previewParameters(context: PreviewContext, mode: PrayerMode) {
    return {
        radius: context.parameters.radius,
        durationMs: mode === 'devotion' ? 400 : context.parameters.durationMs,
    }
}

export function snapshotPrayerParameters(
    player: CharacterSnapshot,
    abilityId: PrayerAbilityId
): PrayerParametersSnapshot {
    return (
        player.abilities?.prayers?.[abilityId] ??
        (abilityId === 'pray' ? player.abilities?.prayer : undefined) ?? {
            radius: ABILITY_DEFINITIONS[abilityId].range,
            durationMs: ABILITY_DEFINITIONS[abilityId].windupMs,
            manaCost: ABILITY_DEFINITIONS[abilityId].mana,
            area: false,
            harm: false,
        }
    )
}

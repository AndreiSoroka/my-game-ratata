import {
    type PrayerIntent,
    type PrayerMode,
    type PrayerPreview,
} from './abilities'
import { ABILITY_DEFINITIONS } from './abilities'
import { type WorldGraveSnapshot } from './graves'
import type { CharacterSnapshot } from './index'
import {
    DEITY_PRAYER_PROFILES,
    type DeityPrayerProfile,
    prayerManaCost,
} from './prayer'
import { resourceNeedsRestoration } from './resources'
export interface PrayerPreviewOptions {
    canReach?: (target: CharacterSnapshot) => boolean
    canAid?: (target: CharacterSnapshot) => boolean
    graves?: readonly WorldGraveSnapshot[]
    canReachGrave?: (target: WorldGraveSnapshot) => boolean
}
interface PreviewContext {
    player: CharacterSnapshot
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
    const context: PreviewContext = {
        player,
        options,
        profile:
            DEITY_PRAYER_PROFILES[player.progression?.deity.id ?? 'hearth'],
        all: [
            ...new Map(
                [...characters, player].map((target) => [target.id, target])
            ).values(),
        ],
    }
    const possibleHarm = harmTargets(context)
    const intent: PrayerIntent = chooseIntent(
        context,
        possibleHarm,
        selectedTargetId
    ) ?? { mode: 'devotion' }
    const harmed = intent.mode === 'devotion' ? [] : possibleHarm
    const manaCost = prayerManaCost(intent.mode)
    return {
        intent,
        manaCost,
        ...previewParameters(player, intent.mode),
        harmfulTargets: harmed.length,
        includesSelf: harmed.some((target) => target.id === player.id),
        includesAllies: harmed.some(
            (target) =>
                target.id !== player.id && target.faction === player.faction
        ),
        unavailableReason: unavailableReason(player, intent.mode),
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
        distance(context, target) <=
            (context.player.abilities?.prayer?.radius ??
                ABILITY_DEFINITIONS.pray.range) &&
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
    if (context.player.abilities?.prayer?.harm !== true) {
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
    mode: PrayerMode
): string | null {
    if (player.abilities?.known.includes('pray') !== true) {
        return 'Молитва не изучена.'
    }
    if (
        !player.alive ||
        player.cooldowns.stunMsLeft > 0 ||
        player.abilities.casting !== null
    ) {
        return 'Персонаж не может молиться сейчас.'
    }
    if ((player.abilities.cooldowns.pray ?? 0) > 0) {
        return 'Молитва восстанавливается.'
    }
    return player.resourceChecks?.prayers[mode] === 'ready'
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
        context.player.progression?.resurrectionUnlocked === true &&
        context.profile.reviveTypes.includes(creatureType(target))
    )
}

function nearbyGraves(context: PreviewContext): WorldGraveSnapshot[] {
    return [...(context.options.graves ?? [])].filter(
        (grave) =>
            context.player.abilities?.known.includes('pray') === true &&
            grave.phase !== 'purified' &&
            Math.hypot(
                grave.position.x - context.player.position.x,
                grave.position.y - context.player.position.y
            ) <=
                (context.player.abilities.prayer?.radius ??
                    ABILITY_DEFINITIONS.pray.range) &&
            (context.options.canReachGrave?.(grave) ?? true)
    )
}

function previewParameters(player: CharacterSnapshot, mode: PrayerMode) {
    return {
        radius:
            player.abilities?.prayer?.radius ?? ABILITY_DEFINITIONS.pray.range,
        durationMs:
            mode === 'devotion'
                ? 400
                : (player.abilities?.prayer?.durationMs ??
                  ABILITY_DEFINITIONS.pray.windupMs),
    }
}

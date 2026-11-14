import {
    PRAYER_RULES,
    type PrayerIntent,
    type PrayerPreview,
} from './abilities'
import type { CharacterSnapshot } from './index'
import { REVIVE_RANGE } from './life'
import {
    DEITY_PRAYER_PROFILES,
    type DeityPrayerProfile,
    prayerManaCost,
} from './prayer'
export interface PrayerPreviewOptions {
    canReach?: (target: CharacterSnapshot) => boolean
    canAid?: (target: CharacterSnapshot) => boolean
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
        harmfulTargets: harmed.length,
        includesSelf: harmed.some((target) => target.id === player.id),
        includesAllies: harmed.some(
            (target) =>
                target.id !== player.id && target.faction === player.faction
        ),
        unavailableReason: unavailableReason(player, manaCost),
    }
}
function creatureType(target: CharacterSnapshot) {
    return target.creatureType
}
function distance(context: PreviewContext, target: CharacterSnapshot): number {
    return Math.hypot(
        context.player.position.x - target.position.x,
        context.player.position.y - target.position.y
    )
}
function nearby(context: PreviewContext, target: CharacterSnapshot): boolean {
    return (
        !target.tags.includes('offline') &&
        target.life?.retired !== true &&
        distance(context, target) <= REVIVE_RANGE &&
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
    if (context.profile.resource === 'energy') {
        return target.resources.energy < target.resources.maxEnergy
    }
    return target.resources.mana < target.resources.maxMana
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
    const level =
        context.player.progression?.skills.find(
            (skill) => skill.id === 'miracles'
        )?.level ?? 1
    if (level < PRAYER_RULES.harmLevel) {
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
    return harmed.length > 0 ? { mode: 'harm' } : undefined
}
function selectedIntent(
    context: PreviewContext,
    harmed: CharacterSnapshot[],
    selectedId: string
): PrayerIntent | undefined {
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
    manaCost: number
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
    return player.resources.mana < manaCost ? 'Недостаточно маны.' : null
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

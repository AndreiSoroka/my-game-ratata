import {
    type PrayerActionId,
    type PrayerMode,
    type PrayerParametersSnapshot,
    type PrayerPreview,
    prayerSchoolId,
} from './abilities'
import { ABILITY_DEFINITIONS } from './abilities'
import type { CharacterSnapshot } from './index'
import {
    PRAYER_SCHOOL_DEFINITIONS,
    prayerManaCost,
    profileForPrayer,
} from './prayer'
import {
    choosePrayerPreviewTargets,
    type PrayerPreviewOptions,
    type PreviewContext,
} from './prayerPreviewTargets'
export type { PrayerPreviewOptions } from './prayerPreviewTargets'
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
        !PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].canPurify
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
    const { intent, targets, harmed } = choosePrayerPreviewTargets(
        context,
        selectedTargetId
    )
    return {
        abilityId,
        intent,
        manaCost: previewManaCost(context, intent.mode),
        ...(context.parameters.cost === undefined
            ? {}
            : { cost: context.parameters.cost }),
        targetCount: targets.length,
        ...previewParameters(context, intent.mode),
        harmfulTargets: harmed.length,
        harmfulTargetIds: harmed.map((target) => target.id),
        includesSelf: harmed.some((target) => target.id === player.id),
        includesAllies: harmed.some(
            (target) =>
                target.id !== player.id && target.faction === player.faction
        ),
        unavailableReason: previewUnavailableReason(
            context,
            intent.mode,
            selectedTargetId
        ),
    }
}
function previewManaCost(context: PreviewContext, mode: PrayerMode): number {
    if (mode === 'devotion') {
        return context.parameters.hasAuras === true ||
            (context.parameters.cost?.healingManaFraction ?? 0) > 0
            ? context.parameters.manaCost
            : 0
    }
    return mode === 'revive'
        ? prayerManaCost(mode, context.abilityId)
        : context.parameters.manaCost
}
function previewUnavailableReason(
    context: PreviewContext,
    mode: PrayerMode,
    selectedId?: string
): string | null {
    return selectedId !== undefined &&
        selectedId !== context.player.id &&
        mode === 'devotion'
        ? 'Выбранная цель недоступна для этой молитвы.'
        : unavailableReason(context.player, mode, context.abilityId)
}
function unavailableReason(
    player: CharacterSnapshot,
    mode: PrayerMode,
    abilityId: PrayerActionId
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

function previewParameters(context: PreviewContext, mode: PrayerMode) {
    return {
        radius: context.parameters.radius,
        durationMs:
            mode === 'devotion' &&
            context.parameters.hasAuras !== true &&
            (context.parameters.cost?.healingManaFraction ?? 0) <= 0
                ? 400
                : context.parameters.durationMs,
    }
}

export function snapshotPrayerParameters(
    player: CharacterSnapshot,
    abilityId: PrayerActionId
): PrayerParametersSnapshot {
    return (
        player.abilities?.prayers?.[abilityId] ??
        (abilityId === 'pray' ? player.abilities?.prayer : undefined) ?? {
            radius: ABILITY_DEFINITIONS[abilityId].range,
            durationMs: ABILITY_DEFINITIONS[abilityId].windupMs,
            manaCost: ABILITY_DEFINITIONS[abilityId].mana,
            area: false,
            harm: false,
            ...(abilityId === 'pray_road'
                ? { energyRecoveryRadius: ABILITY_DEFINITIONS.pray_road.range }
                : {}),
        }
    )
}

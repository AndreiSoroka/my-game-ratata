import { ABILITY_DEFINITIONS, type PrayerMode } from './abilities'
import { ASH_RULES } from './ash'
import type { CharacterSnapshot } from './index'
import type { PreviewContext } from './prayerPreviewTypes'

export function previewModeGeometry(context: PreviewContext, mode: PrayerMode) {
    const { abilityId, parameters } = context
    if (abilityId === 'pray_grave') {
        if (mode === 'harm') {
            return {
                radius: ABILITY_DEFINITIONS.pray_grave.range,
                durationMs: ASH_RULES.brandWindupMs,
            }
        }
        if (mode === 'revive') {
            return (
                parameters.ashRevival ?? {
                    radius: ABILITY_DEFINITIONS.pray_grave.range,
                    durationMs: ABILITY_DEFINITIONS.pray_grave.windupMs,
                }
            )
        }
    }
    return { radius: parameters.radius, durationMs: parameters.durationMs }
}

function canPreviewAshSecondHeal(context: PreviewContext): boolean {
    if (
        context.abilityId !== 'pray_grave' ||
        context.parameters.targetLimit !== 2
    ) {
        return false
    }
    const check = context.player.resourceChecks?.ashSecondHeal
    if (check !== undefined) {
        return check
    }
    const mana = context.player.resources.mana
    return (
        mana.kind === 'exact' &&
        mana.current >= context.parameters.manaCost + ASH_RULES.extraHealMana
    )
}

export function harmPermitsTarget(
    context: PreviewContext,
    target: CharacterSnapshot
): boolean {
    if (context.abilityId !== 'pray_grave') {
        return context.profile.harmTypes.includes(target.creatureType)
    }
    return (
        target.id !== context.player.id &&
        (target.relationship === undefined
            ? target.faction !== context.player.faction
            : target.relationship === 'hostile')
    )
}

export function previewTargetLimit(
    context: PreviewContext,
    mode: PrayerMode
): number {
    if (context.abilityId === 'pray_grave') {
        return mode === 'restore' && canPreviewAshSecondHeal(context) ? 2 : 1
    }
    return (
        context.parameters.targetLimit ??
        (context.abilityId === 'pray_woven' ? 2 : 1)
    )
}

export function previewDistance(
    context: PreviewContext,
    target: Pick<CharacterSnapshot, 'position'>
): number {
    return Math.hypot(
        context.player.position.x - target.position.x,
        context.player.position.y - target.position.y
    )
}

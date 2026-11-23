import {
    type AbilityId,
    isBladeAbility,
    type PrayerActionId,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import type { HotbarEmit, HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'
import type { createGestures } from './hotbarGestures'

export function basicAttackLabel(player: HotbarProps['player']): string {
    return resolveCombatWeapon(player.archetype, player.equipment.weapon).name
}
export function guardBlocksBinding(binding: HotbarBinding, props: HotbarProps): boolean {
    return (
        props.player.combat?.defensiveStance === true &&
        binding.kind !== 'item' &&
        !(binding.kind === 'ability' && binding.id === 'defensive_stance')
    )
}
export function guardActive(id: AbilityId, props: HotbarProps): boolean {
    return id === 'defensive_stance' && props.player.combat?.defensiveStance === true
}
export function bladeAbilityUnavailable(
    id: Exclude<AbilityId, PrayerActionId>,
    props: HotbarProps
): string | undefined {
    if (!isBladeAbility(id)) return undefined
    const weapon = resolveCombatWeapon(props.player.archetype, props.player.equipment.weapon)
    return !weapon.bladeCompatible || weapon.broken
        ? tGame('game.world.bladeWeaponRequired')
        : undefined
}
export function bladeActionTooltip(
    binding: HotbarBinding | null,
    props: HotbarProps
): string | undefined {
    if (binding?.kind === 'attack') {
        const weapon = resolveCombatWeapon(props.player.archetype, props.player.equipment.weapon)
        return [weapon.name, weapon.description].filter(Boolean).join('. ')
    }
    if (binding?.kind === 'ability' && binding.id === 'defensive_stance')
        return props.player.combat?.defensiveStance
            ? tGame('game.world.leaveDefensiveStance')
            : tGame('game.world.defensiveStanceHint')
    return undefined
}
/** A toggle is a single intention, never a repeated auto-action. */
export function activateGuard(
    binding: HotbarBinding,
    known: readonly AbilityId[],
    unavailable: (binding: HotbarBinding) => string | undefined,
    gestures: ReturnType<typeof createGestures>,
    emit: HotbarEmit
): boolean {
    if (binding.kind !== 'ability' || binding.id !== 'defensive_stance') return false
    if (!unavailable(binding) && known.includes(binding.id)) {
        gestures.reset()
        emit('command', { type: 'use_ability', abilityId: binding.id })
    }
    return true
}

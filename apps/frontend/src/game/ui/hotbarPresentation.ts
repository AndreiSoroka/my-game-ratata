import { abilityName, tGame } from '@/shared/lib/i18n'

import { abilityUsage } from './abilityUsage'
import { basicAttackLabel, bladeActionTooltip } from './bladeHotbar'
import { hostileTarget, type HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'
import { magicActionTooltip } from './magicHotbar'

export function bindingLabel(
    binding: HotbarBinding | null,
    player?: HotbarProps['player']
): string {
    if (!binding) return tGame('game.world.emptyQuickSlot')
    if (binding.kind === 'attack')
        return player ? basicAttackLabel(player) : tGame('game.world.basicAttack')
    return binding.kind === 'item'
        ? binding.id === 'sapling'
            ? tGame('game.world.plantTree')
            : tGame('game.world.appleHotbarPresentation')
        : abilityName(binding.id)
}
export function actionTooltip(binding: HotbarBinding | null, props: HotbarProps): string {
    return (
        bladeActionTooltip(binding, props) ??
        rangedActionTooltip(binding, props) ??
        magicActionTooltip(binding, props) ??
        bindingLabel(binding)
    )
}

function rangedActionTooltip(
    binding: HotbarBinding | null,
    props: HotbarProps
): string | undefined {
    if (binding?.kind !== 'ability') return undefined
    if (binding.id === 'sniper_shot') {
        const shot = abilityUsage(props.player, binding.id)
        return tGame('game.world.aimingShot', {
            ability: abilityName(binding.id),
            energy: shot.energy,
            seconds: shot.windupMs / 1000,
        })
    }
    if (hostileTarget(props)) return undefined
    if (binding.id === 'shot')
        return tGame('game.world.forwardShot', {
            ability: abilityName('shot'),
            direction: { up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing],
            energy: abilityUsage(props.player, 'shot').energy,
        })
    if (binding.id === 'spark')
        return tGame('game.world.forwardSpark', {
            direction: { up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing],
            mana: abilityUsage(props.player, 'spark').mana,
            energy: abilityUsage(props.player, 'spark').energy,
        })
    return undefined
}

import { isArrowAbility } from '@my-game-ratata/contracts'

import { abilityUsage } from '@/entities/progression'
import { abilityName, tGame } from '@/shared/lib/i18n'

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
    if (isArrowAbility(binding.id)) {
        const shot = abilityUsage(props.player, binding.id)
        const parameters = {
            ability: abilityName(binding.id),
            energy: shot.energy,
            seconds: shot.windupMs / 1000,
        }
        return binding.id === 'shot' && !hostileTarget(props)
            ? tGame('game.world.forwardShot', {
                  ...parameters,
                  direction: { up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing],
              })
            : tGame('game.world.aimingShot', parameters)
    }
    if (hostileTarget(props)) return undefined
    if (binding.id === 'spark')
        return tGame('game.world.forwardSpark', {
            direction: { up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing],
            mana: abilityUsage(props.player, 'spark').mana,
            energy: abilityUsage(props.player, 'spark').energy,
        })
    return undefined
}

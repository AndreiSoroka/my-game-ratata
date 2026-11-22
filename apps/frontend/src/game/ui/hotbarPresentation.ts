import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import { abilityUsage } from './abilityUsage'
import { basicAttackLabel, bladeActionTooltip } from './bladeHotbar'
import { hostileTarget, type HotbarProps } from './hotbarActions'
import type { HotbarBinding } from './hotbarBindings'
import { magicActionTooltip } from './magicHotbar'

export function bindingLabel(
    binding: HotbarBinding | null,
    player?: HotbarProps['player']
): string {
    if (!binding) return 'Пусто'
    if (binding.kind === 'attack') return player ? basicAttackLabel(player) : 'Базовая атака'
    return binding.kind === 'item'
        ? binding.id === 'sapling'
            ? 'Посадить дерево'
            : 'Яблоко'
        : ABILITY_DEFINITIONS[binding.id].name
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
        return `${ABILITY_DEFINITIONS[binding.id].name} · ${shot.energy} EN · прицеливание ${shot.windupMs / 1000} с`
    }
    if (hostileTarget(props)) return undefined
    if (binding.id === 'shot')
        return `${ABILITY_DEFINITIONS.shot.name} вперёд ${{ up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing]} · ${abilityUsage(props.player, 'shot').energy} EN`
    if (binding.id === 'spark')
        return `Искра вперёд ${{ up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing]} · ${abilityUsage(props.player, 'spark').mana} MP · ${abilityUsage(props.player, 'spark').energy} EN`
    return undefined
}

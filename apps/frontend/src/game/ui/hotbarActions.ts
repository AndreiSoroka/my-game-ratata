import {
    ABILITY_DEFINITIONS,
    type AutoActionWaiting,
    type CharacterAutoAction,
    type CharacterSnapshot,
    type ClientMessage,
    isBladeAbility,
    isPrayerAction,
    type PrayerActionId,
    type PrayerPreview,
    resolveCombatWeapon,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import type { ComputedRef, Ref } from 'vue'

import type { PrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { abilityUsage } from './abilityUsage'
import {
    activateGuard,
    basicAttackLabel,
    bladeAbilityUnavailable,
    bladeActionTooltip,
    guardActive,
    guardBlocksBinding,
} from './bladeHotbar'
import { attackableTarget } from './combatTargeting'
import type { HotbarBinding } from './hotbarBindings'
import type { createGestures } from './hotbarGestures'
export interface HotbarProps {
    player: CharacterSnapshot
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    graves?: WorldGraveSnapshot[]
    objectTarget?: boolean
    canReachGrave?: (grave: WorldGraveSnapshot) => boolean
    characters: CharacterSnapshot[]
    canReach?: (target: CharacterSnapshot) => boolean
    blocked: boolean
}
export interface HotbarEmit {
    (event: 'command', command: ClientMessage): void
    (event: 'cancel'): void
    (event: 'plant'): void
    (event: 'previewChange', preview: PrayerPreviewHighlight | undefined): void
}
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
export function bindingUnavailable(
    binding: HotbarBinding | null,
    props: HotbarProps,
    count: number,
    prayerReason: string | undefined,
    cooldown: number
): string | undefined {
    if (!binding) return undefined
    if (guardBlocksBinding(binding, props)) return 'Сначала выйдите из глухой обороны'
    const objectReason = objectTargetUnavailable(binding, props)
    if (objectReason) return objectReason
    if (binding.kind === 'item')
        return binding.id === 'food' && count === 0 ? 'Нет яблок' : undefined
    if (binding.kind === 'attack') return attackUnavailable(props, cooldown)
    if (isPrayerAction(binding.id)) return prayerReason
    return abilityUnavailable(binding.id, props, cooldown)
}
export function objectTargetUnavailable(
    binding: HotbarBinding | null,
    props: HotbarProps
): string | undefined {
    return props.objectTarget &&
        binding &&
        binding.kind !== 'item' &&
        (binding.kind === 'attack' || !['barrier', 'defensive_stance'].includes(binding.id))
        ? 'Для этой цели используйте F'
        : undefined
}
function attackUnavailable(props: HotbarProps, cooldown: number): string | undefined {
    const weapon = resolveCombatWeapon(props.player.archetype, props.player.equipment.weapon)
    if (weapon.broken) return 'Оружие сломано — снимите или почините его'
    if (props.grave?.phase === 'ruined') return 'Могила разрушена'
    return cooldown > 0 ? 'Атака восстанавливается' : undefined
}
function abilityUnavailable(
    id: Exclude<import('@my-game-ratata/contracts').AbilityId, PrayerActionId>,
    props: HotbarProps,
    cooldown: number
): string | undefined {
    if (guardActive(id, props)) return undefined
    const weaponReason = bladeAbilityUnavailable(id, props)
    if (weaponReason) return weaponReason
    if (!['barrier', 'defensive_stance'].includes(id) && props.grave?.phase === 'ruined')
        return 'Могила разрушена'
    if (cooldown > 0) return 'Умение восстанавливается'
    const resources = abilityResourceReason(id, props)
    if (resources) return resources
    if (!isBladeAbility(id) && !['barrier', 'shot', 'spark'].includes(id) && !hostileTarget(props))
        return 'Выберите врага: E'
    return undefined
}
function abilityResourceReason(
    id: Exclude<import('@my-game-ratata/contracts').AbilityId, PrayerActionId>,
    props: HotbarProps
): string | undefined {
    const check = props.player.resourceChecks?.abilities[id]
    if (check === 'mana') return 'Недостаточно маны'
    if (check === 'energy') return 'Недостаточно энергии'
    return check === 'ready' ? undefined : 'Сейчас недоступно'
}
function actionFor(
    binding: Exclude<HotbarBinding, { kind: 'item' }>,
    props: HotbarProps,
    intent: PrayerPreview['intent']
): Exclude<CharacterAutoAction, { kind: 'gather' | 'plant_tree' }> | undefined {
    const target = combatAddress(props)
    if (binding.kind === 'attack') return target ? { kind: 'attack', ...target } : undefined
    if (isPrayerAction(binding.id))
        return intent ? { kind: 'prayer', abilityId: binding.id, intent } : undefined
    return {
        kind: 'ability',
        abilityId: binding.id,
        ...(binding.id === 'barrier' || binding.id === 'defensive_stance' ? {} : target),
    }
}
function combatAddress(
    props: HotbarProps
):
    | { target: import('@my-game-ratata/contracts').WorldCombatTarget }
    | { targetId: string }
    | undefined {
    if (props.grave) return { target: { kind: 'grave', id: props.grave.id } }
    return props.target?.alive && attackableTarget(props.target, props.player)
        ? { targetId: props.target.id }
        : undefined
}
function singleCommand(
    action: Exclude<CharacterAutoAction, { kind: 'gather' | 'plant_tree' }>
): ClientMessage {
    if (action.kind === 'attack')
        return {
            type: 'attack',
            ...(action.target ? { target: action.target } : { targetId: action.targetId }),
        }
    return action.kind === 'prayer'
        ? { type: 'use_ability', abilityId: action.abilityId ?? 'pray', intent: action.intent }
        : {
              type: 'use_ability',
              abilityId: action.abilityId,
              ...(action.target
                  ? { target: action.target }
                  : action.targetId
                    ? { targetId: action.targetId }
                    : {}),
          }
}
function hostileTarget(props: HotbarProps): boolean {
    return (
        props.grave !== undefined ||
        (props.target !== undefined && attackableTarget(props.target, props.player))
    )
}
interface ActionState {
    bindings: Ref<(HotbarBinding | null)[]>
    food: ComputedRef<CharacterSnapshot['inventory']>
    known: ComputedRef<NonNullable<CharacterSnapshot['abilities']>['known']>
    preview: (abilityId: PrayerActionId) => PrayerPreview
}
export function createActivator(
    props: HotbarProps,
    emit: HotbarEmit,
    state: ActionState,
    gestures: ReturnType<typeof createGestures>,
    unavailable: (binding: HotbarBinding | null) => string | undefined
) {
    const { bindings, food, known, preview } = state
    return function activate(index: number): void {
        const binding = actionableBinding(bindings.value[index], props)
        if (!binding) return
        if (activatePlanting(binding, emit, gestures)) return
        if (activateGuard(binding, known.value, unavailable, gestures, emit)) return
        if (gestures.repeat(index, binding)) return
        if (binding.kind === 'item') {
            if (!unavailable(binding)) activateFood(food.value, emit, gestures, index)
            return
        }
        if (binding.kind === 'ability' && !known.value.includes(binding.id)) return
        const action = bindingAction(binding, props, preview)
        if (!action) {
            if (binding.kind === 'attack') activateUntargetedAttack(binding, unavailable, emit)
            return
        }
        if (!unavailable(binding)) emit('command', singleCommand(action))
        gestures.remember(index, action)
    }
}
function activateUntargetedAttack(
    binding: HotbarBinding,
    unavailable: (binding: HotbarBinding) => string | undefined,
    emit: HotbarEmit
): void {
    if (!unavailable(binding)) emit('command', { type: 'attack' })
}
function activatePlanting(
    binding: HotbarBinding,
    emit: HotbarEmit,
    gestures: ReturnType<typeof createGestures>
): boolean {
    if (binding.kind !== 'item' || binding.id !== 'sapling') return false
    gestures.reset()
    emit('cancel')
    emit('plant')
    return true
}
function actionableBinding(
    binding: HotbarBinding | null | undefined,
    props: HotbarProps
): HotbarBinding | undefined {
    return binding && canAct(props, binding) ? binding : undefined
}
function canAct(props: HotbarProps, binding: HotbarBinding): boolean {
    return (
        !props.blocked &&
        props.player.alive &&
        props.player.cooldowns.stunMsLeft <= 0 &&
        !objectTargetUnavailable(binding, props) &&
        !guardBlocksBinding(binding, props)
    )
}
export function controlWaitingLabel(waiting: AutoActionWaiting | undefined): string {
    return {
        cooldown: 'Повтор: ждём восстановление',
        resources: 'Повтор: ждём силы',
        range: 'Повтор: подходим к цели',
        action: 'Повтор: действие выполняется',
        '': 'Автоповтор включён',
    }[waiting ?? '']
}
function activateFood(
    food: CharacterSnapshot['inventory'],
    emit: HotbarEmit,
    gestures: ReturnType<typeof createGestures>,
    index: number
): void {
    if (!gestures.consumeFood(index)) return
    const item = food[0]
    if (!item) return
    emit('cancel')
    emit('command', { type: 'inventory_action', action: 'eat', itemInstanceId: item.instanceId })
    gestures.rememberFood(index)
}

export function actionTooltip(binding: HotbarBinding | null, props: HotbarProps): string {
    const blade = bladeActionTooltip(binding, props)
    if (blade) return blade
    if (binding?.kind === 'ability' && binding.id === 'shot' && !hostileTarget(props))
        return `Выстрел вперёд ${{ up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing]} · ${abilityUsage(props.player, 'shot').energy} EN`
    if (binding?.kind === 'ability' && binding.id === 'spark' && !hostileTarget(props))
        return `Искра вперёд ${{ up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing]} · ${abilityUsage(props.player, 'spark').mana} MP · ${abilityUsage(props.player, 'spark').energy} EN`
    return bindingLabel(binding)
}

function bindingAction(
    binding: Exclude<HotbarBinding, { kind: 'item' }>,
    props: HotbarProps,
    preview: ActionState['preview']
) {
    const intent =
        binding.kind === 'ability' && isPrayerAction(binding.id) ? preview(binding.id).intent : null
    return actionFor(binding, props, intent)
}

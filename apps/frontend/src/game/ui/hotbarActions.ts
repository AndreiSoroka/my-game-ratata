import {
    ABILITY_DEFINITIONS,
    type AutoActionWaiting,
    type CharacterAutoAction,
    type CharacterSnapshot,
    type ClientMessage,
    isPrayerAction,
    type PrayerActionId,
    type PrayerPreview,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import type { ComputedRef, Ref } from 'vue'

import type { PrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { abilityUsage } from './abilityUsage'
import { attackableTarget } from './combatTargeting'
import type { HotbarBinding } from './hotbarBindings'
import type { createGestures } from './hotbarGestures'
export interface HotbarProps {
    player: CharacterSnapshot
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    graves?: WorldGraveSnapshot[]
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
export function bindingLabel(binding: HotbarBinding | null): string {
    if (!binding) return 'Пусто'
    if (binding.kind === 'attack') return 'Базовая атака'
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
    if (binding.kind === 'item')
        return binding.id === 'food' && count === 0 ? 'Нет яблок' : undefined
    if (binding.kind === 'attack') return attackUnavailable(props, cooldown)
    if (isPrayerAction(binding.id)) return prayerReason
    return abilityUnavailable(binding.id, props, cooldown)
}
function attackUnavailable(props: HotbarProps, cooldown: number): string | undefined {
    if (props.grave?.phase === 'ruined') return 'Могила разрушена'
    return cooldown > 0 ? 'Атака восстанавливается' : undefined
}
function abilityUnavailable(
    id: Exclude<import('@my-game-ratata/contracts').AbilityId, PrayerActionId>,
    props: HotbarProps,
    cooldown: number
): string | undefined {
    if (id !== 'barrier' && props.grave?.phase === 'ruined') return 'Могила разрушена'
    if (cooldown > 0) return 'Умение восстанавливается'
    const resourceCheck = props.player.resourceChecks?.abilities[id]
    if (resourceCheck === 'mana') return 'Недостаточно маны'
    if (resourceCheck === 'energy') return 'Недостаточно энергии'
    if (resourceCheck !== 'ready') return 'Сейчас недоступно'
    if (!['barrier', 'shot', 'spark'].includes(id) && !hostileTarget(props))
        return 'Выберите врага: T'
    return undefined
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
    return { kind: 'ability', abilityId: binding.id, ...(binding.id === 'barrier' ? {} : target) }
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
        const binding = bindings.value[index]
        if (!binding || !canAct(props)) return
        if (activatePlanting(binding, emit, gestures)) return
        if (gestures.repeat(index, binding)) return
        if (binding.kind === 'item') {
            if (!unavailable(binding)) activateFood(food.value, emit, gestures, index)
            return
        }
        if (binding.kind === 'ability' && !known.value.includes(binding.id)) return
        const action = bindingAction(binding, props, preview)
        if (!action) {
            if (binding.kind === 'attack') emit('command', { type: 'attack' })
            return
        }
        if (!unavailable(binding)) emit('command', singleCommand(action))
        gestures.remember(index, action)
    }
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
function canAct(props: HotbarProps): boolean {
    return !props.blocked && props.player.alive && props.player.cooldowns.stunMsLeft <= 0
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
    if (binding?.kind === 'attack') return 'Ближняя базовая атака'
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

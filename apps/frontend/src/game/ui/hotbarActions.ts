import {
    ABILITY_DEFINITIONS,
    type AutoActionWaiting,
    type CharacterAutoAction,
    type CharacterSnapshot,
    type ClientMessage,
    type PrayerPreview,
} from '@my-game-ratata/contracts'
import type { ComputedRef, Ref } from 'vue'

import type { PrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { relation } from './combatTargeting'
import type { HotbarBinding } from './hotbarBindings'
import type { createGestures } from './hotbarGestures'
export interface HotbarProps {
    player: CharacterSnapshot
    target?: CharacterSnapshot
    characters: CharacterSnapshot[]
    canReach?: (target: CharacterSnapshot) => boolean
    blocked: boolean
}
export interface HotbarEmit {
    (event: 'command', command: ClientMessage): void
    (event: 'cancel'): void
    (event: 'previewChange', preview: PrayerPreviewHighlight | undefined): void
}
export function bindingLabel(binding: HotbarBinding | null): string {
    if (!binding) return 'Пусто'
    if (binding.kind === 'attack') return 'Базовая атака'
    return binding.kind === 'item' ? 'Яблоко' : ABILITY_DEFINITIONS[binding.id].name
}
export function bindingUnavailable(
    binding: HotbarBinding | null,
    props: HotbarProps,
    count: number,
    prayerReason: string | undefined,
    cooldown: number
): string | undefined {
    if (!binding) return undefined
    if (binding.kind === 'item') return count === 0 ? 'Нет яблок' : undefined
    if (binding.kind === 'attack') return cooldown > 0 ? 'Атака восстанавливается' : undefined
    if (binding.id === 'pray') return prayerReason
    const ability = ABILITY_DEFINITIONS[binding.id]
    if (cooldown > 0) return 'Умение восстанавливается'
    if (props.player.resources.mana < ability.mana) return 'Недостаточно маны'
    if (props.player.resources.energy < ability.energy) return 'Недостаточно энергии'
    if (!['barrier', 'shot'].includes(binding.id) && !hostileTarget(props))
        return 'Выберите врага: T'
    return undefined
}
function actionFor(
    binding: Exclude<HotbarBinding, { kind: 'item' }>,
    player: CharacterSnapshot,
    target: CharacterSnapshot | undefined,
    intent: PrayerPreview['intent']
): CharacterAutoAction | undefined {
    if (binding.kind === 'attack')
        return target?.alive && relation(target, player) === 'hostile'
            ? { kind: 'attack', targetId: target.id }
            : undefined
    if (binding.id === 'pray') return intent ? { kind: 'prayer', intent } : undefined
    return {
        kind: 'ability',
        abilityId: binding.id,
        ...(target && binding.id !== 'barrier' && relation(target, player) === 'hostile'
            ? { targetId: target.id }
            : {}),
    }
}
function singleCommand(action: CharacterAutoAction): ClientMessage {
    if (action.kind === 'attack') return { type: 'attack', targetId: action.targetId }
    return action.kind === 'prayer'
        ? { type: 'use_ability', abilityId: 'pray', intent: action.intent }
        : {
              type: 'use_ability',
              abilityId: action.abilityId,
              ...(action.targetId ? { targetId: action.targetId } : {}),
          }
}
function hostileTarget(props: HotbarProps): boolean {
    return props.target !== undefined && relation(props.target, props.player) === 'hostile'
}
interface ActionState {
    bindings: Ref<(HotbarBinding | null)[]>
    food: ComputedRef<CharacterSnapshot['inventory']>
    known: ComputedRef<NonNullable<CharacterSnapshot['abilities']>['known']>
    preview: ComputedRef<PrayerPreview>
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
        if (gestures.repeat(index, binding)) return
        if (binding.kind === 'item') {
            if (!unavailable(binding)) activateFood(food.value, emit, gestures, index)
            return
        }
        if (binding.kind === 'ability' && !known.value.includes(binding.id)) return
        const action = actionFor(binding, props.player, props.target, preview.value.intent)
        if (!action) {
            if (binding.kind === 'attack') emit('command', { type: 'attack' })
            return
        }
        if (!unavailable(binding)) emit('command', singleCommand(action))
        gestures.remember(index, action)
    }
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
    if (binding?.kind === 'attack' && props.player.basicAttackKind !== 'spark')
        return 'Ближняя базовая атака'
    if (binding?.kind === 'ability' && binding.id === 'shot' && !hostileTarget(props))
        return `Выстрел вперёд ${{ up: '↑', down: '↓', left: '←', right: '→' }[props.player.facing]} · ${ABILITY_DEFINITIONS.shot.energy} EN`
    return bindingLabel(binding)
}

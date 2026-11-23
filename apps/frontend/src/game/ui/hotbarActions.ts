import {
    type AbilityId,
    type CharacterAutoAction,
    type CharacterSnapshot,
    type ClientMessage,
    isArrowAbility,
    isAshRiteId,
    isBladeAbility,
    isPrayerAction,
    type PrayerActionId,
    type PrayerPreview,
    resolveCombatWeapon,
    type WorldCombatTarget,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import type { ComputedRef, Ref } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import type { PrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { ashHotbarCommand, ashHotbarReason } from './ashActions'
import {
    activateGuard,
    bladeAbilityUnavailable,
    guardActive,
    guardBlocksBinding,
} from './bladeHotbar'
import { attackableTarget } from './combatTargeting'
import type { HotbarBinding } from './hotbarBindings'
import type { createGestures } from './hotbarGestures'
import { activateMagic, isManualMagic, magicUnavailable } from './magicHotbar'

export interface HotbarProps {
    player: CharacterSnapshot
    target?: CharacterSnapshot
    grave?: WorldGraveSnapshot
    graves?: WorldGraveSnapshot[]
    objectTarget?: boolean
    acquireAttackTarget?: () => string | undefined
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
export function bindingUnavailable(
    binding: HotbarBinding | null,
    props: HotbarProps,
    count: number,
    prayerReason: string | undefined,
    cooldown: number
): string | undefined {
    if (!binding) return undefined
    if (guardBlocksBinding(binding, props)) return tGame('game.world.firstLeaveDefensiveStance')
    const objectReason = objectTargetUnavailable(binding, props)
    if (objectReason) return objectReason
    if (binding.kind === 'item')
        return binding.id === 'food' && count === 0 ? tGame('game.world.noApples') : undefined
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
        (binding.kind === 'attack' ||
            (!isManualMagic(binding.id) && binding.id !== 'defensive_stance'))
        ? tGame('game.world.useForTarget')
        : undefined
}
function attackUnavailable(props: HotbarProps, cooldown: number): string | undefined {
    if (attackWeaponBroken(props)) return tGame('game.world.weaponBroken')
    if (props.grave?.phase === 'ruined') return tGame('game.world.graveDestroyed')
    return cooldown > 0 ? tGame('game.world.attackOnCooldown') : undefined
}
function attackWeaponBroken({ player }: HotbarProps): boolean {
    return resolveCombatWeapon(player.archetype, player.equipment.weapon).broken
}
function abilityUnavailable(
    id: Exclude<AbilityId, PrayerActionId>,
    props: HotbarProps,
    cooldown: number
): string | undefined {
    if (guardActive(id, props)) return undefined
    const blocked = bladeAbilityUnavailable(id, props) ?? magicUnavailable(id, props)
    if (blocked) return blocked
    if (isArrowAbility(id) && props.player.movement?.dashing)
        return tGame('game.world.finishDashing')
    if (cooldown > 0) return tGame('game.world.abilityOnCooldown')
    return abilityResourceReason(id, props) ?? abilityTargetReason(id, props)
}

function abilityTargetReason(id: AbilityId, props: HotbarProps): string | undefined {
    if (isAshRiteId(id)) return ashHotbarReason(id, props.player, props.target)
    if (id === 'sniper_shot' && (props.grave || !livingAttackTarget(props)))
        return tGame('game.world.selectLiving')
    return !isBladeAbility(id) &&
        !isManualMagic(id) &&
        !['shot', 'spark'].includes(id) &&
        !hostileTarget(props)
        ? tGame('game.world.selectEnemy')
        : undefined
}
function abilityResourceReason(
    id: Exclude<AbilityId, PrayerActionId>,
    props: HotbarProps
): string | undefined {
    const check = props.player.resourceChecks?.abilities[id]
    if (check === 'mana') return tGame('game.world.notEnoughMana')
    if (check === 'energy') return tGame('game.world.insufficientEnergy')
    return check === 'ready' ? undefined : tGame('game.world.unavailableNow')
}
function actionFor(
    binding: Extract<HotbarBinding, { kind: 'ability' }>,
    props: HotbarProps,
    intent: PrayerPreview['intent']
): Extract<CharacterAutoAction, { kind: 'ability' | 'prayer' }> | undefined {
    if (isPrayerAction(binding.id))
        return intent ? { kind: 'prayer', abilityId: binding.id, intent } : undefined
    if (isAshRiteId(binding.id)) return undefined
    if (binding.id === 'sniper_shot') {
        const target = props.grave ? undefined : livingAttackTarget(props)
        return target ? { kind: 'ability', abilityId: binding.id, targetId: target.id } : undefined
    }
    return {
        kind: 'ability',
        abilityId: binding.id,
        ...(binding.id === 'defensive_stance' ? {} : combatAddress(props)),
    }
}

function combatAddress(
    props: HotbarProps
):
    | { target: WorldCombatTarget; targetId?: never }
    | { targetId: string; target?: never }
    | undefined {
    if (props.grave) return { target: { kind: 'grave', id: props.grave.id } }
    const target = livingAttackTarget(props)
    return target ? { targetId: target.id } : undefined
}
function livingAttackTarget(props: HotbarProps): CharacterSnapshot | undefined {
    return props.target?.alive && attackableTarget(props.target, props.player)
        ? props.target
        : undefined
}
function singleCommand(
    action: Extract<CharacterAutoAction, { kind: 'ability' | 'prayer' }>
): ClientMessage {
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
export function hostileTarget(props: HotbarProps): boolean {
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
    function activateKnownAbility(
        binding: Extract<HotbarBinding, { kind: 'ability' }>,
        index: number
    ): void {
        if (!known.value.includes(binding.id)) return
        if (isAshRiteId(binding.id)) {
            const command = ashHotbarCommand(binding.id, props.target)
            if (command && !unavailable(binding)) emit('command', command)
            return
        }
        const action = bindingAction(binding, props, preview)
        if (!action) return
        if (!unavailable(binding)) emit('command', singleCommand(action))
        gestures.remember(index, action)
    }
    return function activate(index: number): void {
        const binding = actionableBinding(bindings.value[index], props)
        if (!binding) return
        if (activatePlanting(binding, emit, gestures)) return
        if (activateGuard(binding, known.value, unavailable, gestures, emit)) return
        if (activateMagic(binding, props, known.value, unavailable, gestures, emit)) return
        if (gestures.repeat(index, binding)) return
        if (binding.kind === 'item') {
            if (!unavailable(binding)) activateFood(food.value, emit, gestures, index)
            return
        }
        if (binding.kind === 'attack') {
            activateAttack(props, emit, gestures, index, unavailable(binding))
            return
        }
        activateKnownAbility(binding, index)
    }
}
function activateAttack(
    props: HotbarProps,
    emit: HotbarEmit,
    gestures: ReturnType<typeof createGestures>,
    index: number,
    reason: string | undefined
): void {
    const address = combatAddress(props)
    if (!props.grave && (props.player.basicAttackKind ?? 'melee') === 'melee') {
        if (attackWeaponBroken(props)) return
        const acquiredTargetId = address ? undefined : props.acquireAttackTarget?.()
        const targetId = address?.targetId ?? acquiredTargetId
        if (targetId !== undefined) {
            const attack = { kind: 'attack', targetId } as const
            emit('command', {
                type: 'auto_action',
                action: { ...attack, once: true },
            })
            gestures.markAttackPending(targetId)
            gestures.remember(index, attack, acquiredTargetId)
            return
        }
    }
    if (!reason) emit('command', { type: 'attack', ...address })
    if (address) gestures.remember(index, { kind: 'attack', ...address })
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

function bindingAction(
    binding: Extract<HotbarBinding, { kind: 'ability' }>,
    props: HotbarProps,
    preview: ActionState['preview']
) {
    const intent = isPrayerAction(binding.id) ? preview(binding.id).intent : null
    return actionFor(binding, props, intent)
}

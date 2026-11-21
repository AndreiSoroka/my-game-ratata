import {
    type CharacterControlSnapshot,
    isPrayerAction,
    type PrayerActionId,
    previewPrayerFromSnapshots,
} from '@my-game-ratata/contracts'
import { computed, type ComputedRef, onBeforeUnmount, watch } from 'vue'

import { createPrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { relation } from './combatTargeting'
import { gravePrayerPreview } from './graveInteractions'
import {
    actionTooltip,
    bindingLabel,
    bindingUnavailable,
    createActivator,
    type HotbarEmit,
    type HotbarProps,
    objectTargetUnavailable,
} from './hotbarActions'
import { type HotbarBinding, prayerDescription } from './hotbarBindings'
import { createGestures } from './hotbarGestures'
import { useSavedHotbarBindings } from './hotbarSession'
import { preferredPrayer } from './prayerSelection'

export function useHotbarActions(props: HotbarProps, emit: HotbarEmit) {
    const bindings = useSavedHotbarBindings(() => props.player)
    const food = computed(() => props.player.inventory.filter((item) => item.itemId === 'food'))
    const count = computed(() => food.value.reduce((sum, item) => sum + (item.quantity ?? 1), 0))
    const saplings = computed(() =>
        props.player.inventory
            .filter((item) => item.itemId === 'sapling')
            .reduce((sum, item) => sum + (item.quantity ?? 1), 0)
    )
    const known = computed(() => props.player.abilities?.known ?? [])
    const boundPrayers = computed(() => [
        ...new Set(
            bindings.value.flatMap((binding) =>
                binding?.kind === 'ability' && isPrayerAction(binding.id) ? [binding.id] : []
            )
        ),
    ])
    const prayerAssigned = computed(() => boundPrayers.value.length > 0)
    const selectedPrayer = computed(
        () => preferredPrayer(props.player, boundPrayers.value) ?? boundPrayers.value[0] ?? 'pray'
    )
    const previewFor = (abilityId: PrayerActionId) => prayerPreview(props, abilityId)
    const preview = computed(() => previewFor(selectedPrayer.value))
    watchPrayerHighlight(props, emit, prayerAssigned, preview)
    const gestures = createGestures(props, emit, () => bindings.value)
    watchGestureChanges(props, gestures)
    const cooldown = (binding: HotbarBinding | null) =>
        binding?.kind === 'ability'
            ? (props.player.abilities?.cooldowns[binding.id] ?? 0)
            : binding?.kind === 'attack'
              ? props.player.cooldowns.attackMsLeft
              : 0
    const unavailable = (binding: HotbarBinding | null) =>
        bindingUnavailable(
            binding,
            props,
            count.value,
            binding?.kind === 'ability' && isPrayerAction(binding.id)
                ? (previewFor(binding.id).unavailableReason ?? undefined)
                : undefined,
            cooldown(binding)
        )
    const activate = createActivator(
        props,
        emit,
        { bindings, food, known, preview: previewFor },
        gestures,
        unavailable
    )
    const active = activeBindingCheck(props, gestures)
    const waiting = computed(() => controlWaitingLabel(props.player.control))
    return {
        bindings,
        food,
        count,
        saplings,
        known,
        label: (binding: HotbarBinding | null) => bindingLabel(binding, props.player),
        cooldown,
        unavailable,
        tooltip: (binding: HotbarBinding | null) =>
            binding?.kind === 'ability' && isPrayerAction(binding.id)
                ? prayerDescription(
                      previewFor(binding.id),
                      props.characters,
                      props.player,
                      props.grave
                  )
                : actionTooltip(binding, props),
        activate,
        active,
        waiting,
        resetGesture: gestures.reset,
        hasPendingAttack: gestures.hasPendingAttack,
    }
}
function controlWaitingLabel(control: CharacterControlSnapshot | undefined): string {
    const waiting = control?.waiting ?? ''
    if (control?.action?.kind === 'attack' && control.action.once === true)
        return {
            cooldown: 'Ждём восстановления удара',
            resources: 'Ждём силы',
            range: 'Подходим к цели',
            action: 'Ждём завершения действия',
            '': 'Готовим удар',
        }[waiting]
    return {
        cooldown: 'Повтор: ждём восстановление',
        resources: 'Повтор: ждём силы',
        range: 'Повтор: подходим к цели',
        action: 'Повтор: действие выполняется',
        '': 'Автоповтор включён',
    }[waiting]
}
function prayerPreview(props: HotbarProps, abilityId: PrayerActionId) {
    const objectReason = objectTargetUnavailable({ kind: 'ability', id: abilityId }, props)
    if (objectReason !== undefined)
        return {
            abilityId,
            intent: null,
            manaCost: 0,
            harmfulTargets: 0,
            includesAllies: false,
            includesSelf: false,
            unavailableReason: objectReason,
        }
    return props.grave
        ? gravePrayerPreview(
              props.player,
              props.grave,
              props.canReachGrave?.(props.grave) ?? true,
              props.characters,
              props.canReach,
              abilityId
          )
        : previewPrayerFromSnapshots(props.player, props.characters, props.target?.id, {
              abilityId,
              canReach: props.canReach,
              graves: props.graves,
              canReachGrave: props.canReachGrave,
              canAid: (target) => relation(target, props.player) !== 'hostile',
          })
}
function watchPrayerHighlight(
    props: HotbarProps,
    emit: HotbarEmit,
    prayerAssigned: ComputedRef<boolean>,
    preview: ComputedRef<ReturnType<typeof previewPrayerFromSnapshots>>
): void {
    const highlight = computed(() =>
        prayerAssigned.value && !props.blocked && !props.objectTarget
            ? createPrayerPreviewHighlight(props.player, props.characters, preview.value, {
                  active: true,
                  canReach: props.canReach ?? (() => true),
              })
            : undefined
    )
    watch(highlight, (value) => emit('previewChange', value), { immediate: true })
    onBeforeUnmount(() => emit('previewChange', undefined))
}

function watchGestureChanges(
    props: HotbarProps,
    gestures: ReturnType<typeof createGestures>
): void {
    watch(
        () => props.player.id,
        () => gestures.reset()
    )
    watch(
        () => props.target?.id,
        (targetId) => gestures.syncTarget(targetId)
    )
    watch(
        [
            () => props.grave?.id,
            () => props.grave?.phase,
            () => props.objectTarget,
            () => props.blocked,
        ],
        () => gestures.reset()
    )
    watch([() => props.player.control, () => props.player.combat?.action?.id], () =>
        gestures.acknowledge()
    )
}

function activeBindingCheck(props: HotbarProps, gestures: ReturnType<typeof createGestures>) {
    return (binding: HotbarBinding | null, index: number) =>
        binding?.kind === 'ability' && binding.id === 'defensive_stance'
            ? props.player.combat?.defensiveStance === true
            : gestures.active(index, binding)
}

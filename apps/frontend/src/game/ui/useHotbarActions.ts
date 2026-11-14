import { previewPrayerFromSnapshots } from '@my-game-ratata/contracts'
import { computed, type ComputedRef, onBeforeUnmount, watch } from 'vue'

import { createPrayerPreviewHighlight } from '../runtime/prayerPreviewPresentation'
import { relation } from './combatTargeting'
import { gravePrayerPreview } from './graveInteractions'
import {
    actionTooltip,
    bindingLabel,
    bindingUnavailable,
    controlWaitingLabel,
    createActivator,
    type HotbarEmit,
    type HotbarProps,
} from './hotbarActions'
import { type HotbarBinding, prayerDescription } from './hotbarBindings'
import { createGestures } from './hotbarGestures'
import { useSavedHotbarBindings } from './hotbarSession'

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
    const prayerAssigned = computed(() =>
        bindings.value.some((binding) => binding?.kind === 'ability' && binding.id === 'pray')
    )
    const preview = computed(() => prayerPreview(props))
    watchPrayerHighlight(props, emit, prayerAssigned, preview)
    const gestures = createGestures(props, emit, () => bindings.value)
    watch(
        () => props.player.id,
        () => gestures.reset()
    )
    watch(
        [
            () => props.target?.id,
            () => props.grave?.id,
            () => props.grave?.phase,
            () => props.blocked,
        ],
        () => gestures.reset()
    )
    watch(
        () => props.player.control,
        () => gestures.acknowledge()
    )
    const cooldown = (binding: HotbarBinding | null) =>
        binding?.kind === 'ability'
            ? (props.player.abilities?.cooldowns[binding.id] ?? 0)
            : binding?.kind === 'attack'
              ? props.player.cooldowns.attackMsLeft
              : 0
    const prayerTooltip = () =>
        prayerDescription(preview.value, props.characters, props.player, props.grave)
    const unavailable = (binding: HotbarBinding | null) =>
        bindingUnavailable(
            binding,
            props,
            count.value,
            preview.value.unavailableReason ?? undefined,
            cooldown(binding)
        )
    const activate = createActivator(
        props,
        emit,
        { bindings, food, known, preview },
        gestures,
        unavailable
    )
    const active = (binding: HotbarBinding | null, index: number) => gestures.active(index, binding)
    const waiting = computed(() => controlWaitingLabel(props.player.control?.waiting))
    return {
        bindings,
        food,
        count,
        saplings,
        known,
        prayerAssigned,
        label: bindingLabel,
        cooldown,
        unavailable,
        tooltip: (binding: HotbarBinding | null) =>
            binding?.kind === 'ability' && binding.id === 'pray'
                ? prayerTooltip()
                : actionTooltip(binding, props),
        prayerTooltip,
        activate,
        active,
        waiting,
        resetGesture: gestures.reset,
    }
}
function prayerPreview(props: HotbarProps) {
    return props.grave
        ? gravePrayerPreview(props.player, props.grave, props.canReachGrave?.(props.grave) ?? true)
        : previewPrayerFromSnapshots(props.player, props.characters, props.target?.id, {
              canReach: props.canReach,
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
        prayerAssigned.value && !props.blocked && !props.grave
            ? createPrayerPreviewHighlight(props.player, props.characters, preview.value, {
                  active: true,
                  canReach: props.canReach ?? (() => true),
              })
            : undefined
    )
    watch(highlight, (value) => emit('previewChange', value), { immediate: true })
    onBeforeUnmount(() => emit('previewChange', undefined))
}

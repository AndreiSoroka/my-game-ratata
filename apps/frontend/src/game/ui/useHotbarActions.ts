import {
    ABILITY_DEFINITIONS,
    isPrayerAbility,
    type PrayerAbilityId,
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
    controlWaitingLabel,
    createActivator,
    type HotbarEmit,
    type HotbarProps,
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
                binding?.kind === 'ability' && isPrayerAbility(binding.id) ? [binding.id] : []
            )
        ),
    ])
    const prayerAssigned = computed(() => boundPrayers.value.length > 0)
    const selectedPrayer = computed(
        () => preferredPrayer(props.player, boundPrayers.value) ?? boundPrayers.value[0] ?? 'pray'
    )
    const previewFor = (abilityId: PrayerAbilityId) => prayerPreview(props, abilityId)
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
    const prayerTooltip = () =>
        describedPrayer(props, preview.value, selectedPrayer.value, boundPrayers.value.length)
    const unavailable = (binding: HotbarBinding | null) =>
        bindingUnavailable(
            binding,
            props,
            count.value,
            binding?.kind === 'ability' && isPrayerAbility(binding.id)
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
            binding?.kind === 'ability' && isPrayerAbility(binding.id)
                ? prayerDescription(
                      previewFor(binding.id),
                      props.characters,
                      props.player,
                      props.grave
                  )
                : actionTooltip(binding, props),
        prayerTooltip,
        activate,
        active,
        waiting,
        resetGesture: gestures.reset,
    }
}
function prayerPreview(props: HotbarProps, abilityId: PrayerAbilityId) {
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
        prayerAssigned.value && !props.blocked
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
}

function describedPrayer(
    props: HotbarProps,
    preview: ReturnType<typeof previewPrayerFromSnapshots>,
    abilityId: PrayerAbilityId,
    count: number
): string {
    const text = prayerDescription(preview, props.characters, props.player, props.grave)
    return abilityId === 'pray' && count < 2
        ? text
        : `${ABILITY_DEFINITIONS[abilityId].name}: ${text}`
}

<script setup lang="ts">
import './chestContainer.css'

import {
    canAcceptInventoryItem,
    type CharacterSnapshot,
    type ChestContainerSnapshot,
    type ClientMessage,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import { ChestPane } from '@/entities/items'
import { dialogActionKeys } from '@/pages/gameplay/model/dialogActionKeys'
import { useEscapeOwner } from '@/pages/gameplay/model/uiEscapeOwners'
import { focusPanelSurface } from '@/pages/gameplay/model/uiKeyboard'
import { tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { UiFrame } from '@/shared/ui/common'

const props = defineProps<{ chest: ChestContainerSnapshot; player: CharacterSnapshot }>()
const emit = defineEmits<{ command: [message: ClientMessage]; close: [] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({ active: () => true, escape: () => emit('close'), element: panel })
const titleId = useId()
const focusedId = ref('')
const isCorpse = computed(() => props.chest.kind === 'corpse')
const containerTitle = computed(() => props.chest.title ?? tGame('game.world.chest'))
const containerName = computed(() =>
    props.chest.kind === 'barrel' ? tGame('game.world.barrelLower') : tGame('game.world.chestLower')
)
const containerPlace = computed(() =>
    props.chest.kind === 'barrel'
        ? tGame('game.world.barrelPrepositional')
        : tGame('game.world.chestPrepositional')
)
const hasGold = computed(() => (props.chest.gold ?? 0) > 0)
const freeSlots = computed(() => Math.max(0, INVENTORY_CAPACITY - props.player.inventory.length))
const takeableItems = computed(() =>
    props.chest.items.filter((item) => canAcceptInventoryItem(props.player.inventory, item))
)
const bagItems = computed(() =>
    props.player.inventory.filter(
        (item) =>
            !Object.values(props.player.equipment).some(
                (equipped) => equipped?.instanceId === item.instanceId
            )
    )
)
const placeableItemIds = computed(() => {
    if (isCorpse.value) return new Set<string>()
    const { capacity, items } = props.chest
    const placeable =
        capacity === undefined
            ? bagItems.value
            : bagItems.value.filter((item) => canAcceptInventoryItem(items, item, capacity))
    return new Set(placeable.map((item) => item.instanceId))
})
const bagCapacityHint = computed(() => {
    if (takeableItems.value.length) return tGame('game.world.remainingStackSpace')
    if (isCorpse.value) return tGame('game.world.lootDoesNotFit')
    if (props.chest.capacity !== undefined && !placeableItemIds.value.size)
        return tGame('game.world.makeBackpackRoom')
    return tGame('game.world.makeRoom')
})
const actionIds = computed(() => [
    ...Array.from(placeableItemIds.value, (id) => `bag:${id}`),
    ...props.chest.items.map((item) => `chest:${item.instanceId}`),
    ...(hasGold.value ? ['chest:gold'] : []),
])
function buttons(): HTMLButtonElement[] {
    return Array.from(
        panel.value?.querySelectorAll<HTMLButtonElement>('[data-dialog-action]:not(:disabled)') ??
            []
    )
}
function focusAction(id: string): void {
    const button = buttons().find((item) => item.dataset.dialogAction === id)
    if (button) {
        button.focus()
        return
    }
    const side = id.startsWith('bag:') ? 'bag' : 'chest'
    panel.value?.querySelector<HTMLElement>(`[data-chest-pane="${side}"]`)?.focus()
}
function trackFocus(event: FocusEvent): void {
    if (!(event.target instanceof HTMLElement)) return
    focusedId.value =
        event.target.dataset.dialogAction ?? `${event.target.dataset.chestPane ?? 'chest'}:`
}
function take(itemInstanceId: string): void {
    if (takeableItems.value.some((item) => item.instanceId === itemInstanceId))
        emit('command', { type: 'take_chest_item', chestId: props.chest.chestId, itemInstanceId })
}
function put(itemInstanceId: string): void {
    if (placeableItemIds.value.has(itemInstanceId))
        emit('command', { type: 'put_chest_item', chestId: props.chest.chestId, itemInstanceId })
}
function takeAll(): void {
    if (takeableItems.value.length || hasGold.value)
        emit('command', { type: 'take_all_chest_items', chestId: props.chest.chestId })
}
function takeGold(): void {
    if (hasGold.value) emit('command', { type: 'take_chest_gold', chestId: props.chest.chestId })
}
watch(
    [
        () => actionIds.value.join('|'),
        freeSlots,
        () => takeableItems.value.map((item) => item.instanceId).join('|'),
    ] as const,
    async ([ids], [previousIds], onCleanup) => {
        let cancelled = false
        onCleanup(() => {
            cancelled = true
        })
        const previous = focusedId.value
        await nextTick()
        if (cancelled) return
        const current = buttons().find((button) => button.dataset.dialogAction === previous)
        if (current) {
            current.focus()
            return
        }
        const side = previous.startsWith('bag:') ? 'bag:' : 'chest:'
        const nextIds = ids.split('|').filter((id) => id.startsWith(side))
        const index = Math.max(
            0,
            previousIds
                .split('|')
                .filter((id) => id.startsWith(side))
                .indexOf(previous)
        )
        focusAction(nextIds[Math.min(index, nextIds.length - 1)] ?? side)
    }
)
onMounted(async () => {
    await nextTick()
    focusAction(
        props.chest.items[0]
            ? `chest:${props.chest.items[0].instanceId}`
            : hasGold.value
              ? 'chest:gold'
              : (actionIds.value[0] ?? 'chest:')
    )
})
onBeforeUnmount(() => {
    void nextTick(() => {
        if (!document.querySelector('[role="dialog"], .inventory-overlay'))
            document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
    })
})
</script>
<template>
    <div class="chest-backdrop" @pointerdown.self.prevent.stop @click.self.stop>
        <section
            ref="panel"
            class="chest-window game-frame-host"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            :aria-labelledby="titleId"
            @keydown.stop="dialogActionKeys($event, panel, () => emit('close'))"
            @keyup.stop
            @pointerdown.stop="focusPanelSurface($event, panel)"
            @click.stop
            @focusin="trackFocus"
        >
            <UiFrame variant="window" />
            <header class="chest-header">
                <div>
                    <h2 :id="titleId">
                        {{
                            isCorpse
                                ? containerTitle
                                : tGame('game.world.backpackAndContainer', {
                                      container: containerName,
                                  })
                        }}
                    </h2>
                    <p>
                        {{
                            isCorpse
                                ? tGame('game.world.takeRemainingLoot')
                                : tGame('game.world.transferBetweenBags')
                        }}
                    </p>
                </div>
                <UiButton
                    size="small"
                    type="button"
                    data-dialog-action="close"
                    :aria-label="
                        isCorpse
                            ? tGame('game.world.closeLoot')
                            : tGame('game.world.closeContainer')
                    "
                    @click="emit('close')"
                >
                    ×
                </UiButton>
            </header>
            <p
                class="chest-capacity"
                :class="{ 'chest-capacity--full': freeSlots === 0 }"
                role="status"
            >
                {{ tGame('game.world.backpack') }} {{ player.inventory.length }} /
                {{ INVENTORY_CAPACITY }} {{ tGame('game.world.slotsFree') }}
                {{ freeSlots }}
                <span v-if="freeSlots === 0">{{ bagCapacityHint }}</span>
            </p>
            <div class="chest-columns">
                <ChestPane
                    side="bag"
                    :title="tGame('game.world.myBackpack')"
                    :items="bagItems"
                    :is-item-disabled="(item) => !placeableItemIds.has(item.instanceId)"
                    :action-label="tGame('game.world.putIn')"
                    :empty-text="tGame('game.world.yourBackpackIsEmpty')"
                    @select="put"
                >
                    <p class="chest-pane-hint">{{ tGame('game.world.equippedItemsStayOnYour') }}</p>
                </ChestPane>
                <ChestPane
                    side="chest"
                    :title="containerTitle"
                    :items="chest.items"
                    :capacity="chest.capacity"
                    :is-item-disabled="(item) => !canAcceptInventoryItem(player.inventory, item)"
                    :action-label="tGame('game.world.take')"
                    :empty-text="
                        isCorpse
                            ? tGame('game.world.noRemainingLoot')
                            : tGame('game.world.emptyContainer')
                    "
                    @select="take"
                >
                    <UiButton
                        size="small"
                        v-if="hasGold"
                        type="button"
                        data-dialog-action="chest:gold"
                        @click="takeGold"
                    >
                        {{ tGame('game.world.takeGold') }} {{ chest.gold }}
                    </UiButton>
                    <UiButton
                        size="small"
                        class="chest-take-all"
                        type="button"
                        data-dialog-action="all"
                        :disabled="!takeableItems.length && !hasGold"
                        @click="takeAll"
                    >
                        {{ tGame('game.world.takeAll') }}
                    </UiButton>
                </ChestPane>
            </div>
            <p class="chest-hint">
                {{ tGame('game.world.switchSidesWSSelect') }}
                {{
                    isCorpse
                        ? tGame('game.world.inBody')
                        : tGame('game.world.inContainer', { container: containerPlace })
                }}.
            </p>
        </section>
    </div>
</template>

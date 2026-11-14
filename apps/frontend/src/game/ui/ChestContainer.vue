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

import ChestPane from './ChestPane.vue'
import { dialogActionKeys } from './dialogActionKeys'
import { useEscapeOwner } from './uiEscapeOwners'
import { focusPanelSurface } from './uiKeyboard'

const props = defineProps<{ chest: ChestContainerSnapshot; player: CharacterSnapshot }>()
const emit = defineEmits<{ command: [message: ClientMessage]; close: [] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({ active: () => true, escape: () => emit('close'), element: panel })
const titleId = useId()
const focusedId = ref('')
const isCorpse = computed(() => props.chest.kind === 'corpse')
const containerTitle = computed(() => props.chest.title ?? 'Сундук')
const containerName = computed(() => (props.chest.kind === 'barrel' ? 'бочка' : 'сундук'))
const containerPlace = computed(() => (props.chest.kind === 'barrel' ? 'бочке' : 'сундуке'))
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
const actionIds = computed(() => [
    ...bagItems.value.map((item) => `bag:${item.instanceId}`),
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
    if (!isCorpse.value && bagItems.value.some((item) => item.instanceId === itemInstanceId))
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
            class="chest-window"
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
            <header class="chest-header">
                <div>
                    <h2 :id="titleId">
                        {{ isCorpse ? containerTitle : `Рюкзак и ${containerName}` }}
                    </h2>
                    <p>
                        {{
                            isCorpse
                                ? 'Можно забрать оставшиеся вещи и золото.'
                                : 'Слева ваши вещи, справа — содержимое контейнера.'
                        }}
                    </p>
                </div>
                <button
                    type="button"
                    data-dialog-action="close"
                    :aria-label="isCorpse ? 'Закрыть обыск' : 'Закрыть контейнер'"
                    @click="emit('close')"
                >
                    ×
                </button>
            </header>
            <p
                class="chest-capacity"
                :class="{ 'chest-capacity--full': freeSlots === 0 }"
                role="status"
            >
                Рюкзак: {{ player.inventory.length }} / {{ INVENTORY_CAPACITY }} слотов · свободно
                {{ freeSlots }}
                <span v-if="freeSlots === 0">{{
                    takeableItems.length
                        ? 'Все слоты заняты. Подходящие материалы можно добавить в неполные стопки.'
                        : isCorpse
                          ? 'Рюкзак заполнен. Непоместившиеся вещи останутся в теле.'
                          : 'Рюкзак заполнен. Переложите вещь в контейнер, чтобы освободить место.'
                }}</span>
            </p>
            <div class="chest-columns">
                <ChestPane
                    side="bag"
                    title="Мой рюкзак"
                    :items="bagItems"
                    :is-item-disabled="() => isCorpse"
                    action-label="Положить →"
                    empty-text="В рюкзаке нет вещей."
                    @select="put"
                >
                    <p class="chest-pane-hint">Надетые вещи остаются на персонаже.</p>
                </ChestPane>
                <ChestPane
                    side="chest"
                    :title="containerTitle"
                    :items="chest.items"
                    :is-item-disabled="(item) => !canAcceptInventoryItem(player.inventory, item)"
                    action-label="← Взять"
                    :empty-text="isCorpse ? 'Вещей не осталось.' : 'Контейнер пуст.'"
                    @select="take"
                >
                    <button
                        v-if="hasGold"
                        type="button"
                        data-dialog-action="chest:gold"
                        @click="takeGold"
                    >
                        Взять золото: {{ chest.gold }}
                    </button>
                    <button
                        class="chest-take-all"
                        type="button"
                        data-dialog-action="all"
                        :disabled="!takeableItems.length && !hasGold"
                        @click="takeAll"
                    >
                        Забрать всё
                    </button>
                </ChestPane>
            </div>
            <p class="chest-hint">
                ←→ — сторона · ↑↓ / W S — выбор · E / Enter — переложить · Esc — закрыть. Стопки
                переносятся целиком. Непоместившиеся останутся
                {{ isCorpse ? 'в теле' : `в ${containerPlace}` }}.
            </p>
        </section>
    </div>
</template>

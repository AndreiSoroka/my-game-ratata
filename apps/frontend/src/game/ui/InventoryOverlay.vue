<script setup lang="ts">
import './inventoryOverlay.css'

import {
    type AdventureMaterials,
    type CharacterSnapshot,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    type EquipmentActionKind,
    type EquipmentSlotId,
    INVENTORY_CAPACITY,
    type InventoryActionKind,
    type ItemInstanceSnapshot,
    type WorldChestSnapshot,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'
import InventoryItemDetails from './InventoryItemDetails.vue'
import { inventoryKey } from './inventoryKeyboard'
import ItemCondition from './ItemCondition.vue'
import { itemStackLabel } from './itemLabels'
import { useInventoryFocus } from './useInventoryFocus'

const props = defineProps<{
    character: CharacterSnapshot
    chests: WorldChestSnapshot[]
    materials?: AdventureMaterials
    gold?: number
}>()

const emit = defineEmits<{
    close: []
    plant: []
    assignHotbar: [payload: { slot: number; itemId: 'food' | 'sapling' }]
    equipmentAction: [
        payload: {
            action: EquipmentActionKind
            slot: EquipmentSlotId
        },
    ]
    inventoryAction: [
        payload: {
            action: InventoryActionKind
            itemInstanceId: string
        },
    ]
}>()

const panel = ref<HTMLElement>()
const focusSurface = useInventoryFocus(panel, () => emit('close'))
const selectedItemId = ref<string>()
const focusedItemId = ref<string>()
const assignedSlot = ref<number>()
const equipmentSlots: EquipmentSlotId[] = ['weapon', 'boots']
const inventorySlots = computed(() =>
    Array.from({ length: INVENTORY_CAPACITY }, (_, index) => props.character.inventory[index])
)
const selectedItem = computed(() =>
    props.character.inventory.find((item) => item.instanceId === selectedItemId.value)
)
const inspectedItem = computed(
    () =>
        selectedItem.value ??
        props.character.inventory.find((item) => item.instanceId === focusedItemId.value)
)
const hasNearbyChest = computed(() =>
    props.chests.some(
        (chest) =>
            chest.kind !== 'corpse' &&
            chestInteractionDistance(props.character.position, chest.position, chest.bounds) <=
                CHEST_INTERACTION_RANGE
    )
)

watch(selectedItemId, () => {
    assignedSlot.value = undefined
})

function assignHotbar(slot: number, item: ItemInstanceSnapshot | undefined): void {
    if (item?.itemId !== 'food' && item?.itemId !== 'sapling') return
    emit('assignHotbar', { slot, itemId: item.itemId })
    assignedSlot.value = slot
}

function onKey(event: KeyboardEvent): void {
    const digit = /^Digit([1-4])$/.exec(event.code)
    if (digit && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        if (event.repeat) return
        const focusedSlot =
            event.target instanceof HTMLElement
                ? event.target.closest<HTMLElement>('.inventory-slot')
                : null
        const item = focusedSlot
            ? props.character.inventory.find(
                  (item) => item.instanceId === focusedSlot.dataset.itemInstanceId
              )
            : selectedItem.value
        assignHotbar(Number(digit[1]) - 1, item)
        return
    }
    inventoryKey(event, panel.value, () => emit('close'))
}

watch(
    () => props.character.inventory.map((item) => item.instanceId),
    (ids, previousIds) => {
        const selected = selectedItemId.value
        if (selected === undefined || ids.includes(selected)) return

        const slotIndex = previousIds.indexOf(selected)
        const focused = document.activeElement
        const restoreSlot = panel.value?.querySelector('.inventory-actions')?.contains(focused)
        selectedItemId.value = undefined
        if (!restoreSlot || slotIndex < 0) return

        // The server removed the item and Vue is about to remove its focused action button.
        // Keep the keyboard cursor at the same cell, even when the bag compacts or is empty.
        void nextTick(() => {
            if (
                panel.value?.isConnected &&
                (document.activeElement === focused || document.activeElement === document.body)
            ) {
                panel.value
                    .querySelectorAll<HTMLButtonElement>('.inventory-slot')
                    [slotIndex]?.focus()
            }
        })
    }
)

function selectItem(item: ItemInstanceSnapshot | undefined): void {
    if (item === undefined) {
        selectedItemId.value = undefined
        return
    }

    selectedItemId.value = selectedItemId.value === item.instanceId ? undefined : item.instanceId
    if (selectedItemId.value)
        void nextTick(() =>
            panel.value?.querySelector<HTMLButtonElement>('.inventory-actions button')?.focus()
        )
}

function itemName(item: ItemInstanceSnapshot): string {
    return itemStackLabel(item)
}

function unequip(slot: EquipmentSlotId): void {
    if (props.character.equipment[slot] === undefined) {
        return
    }

    emit('equipmentAction', {
        action: 'unequip',
        slot,
    })
}
</script>

<template>
    <aside
        ref="panel"
        class="inventory-overlay"
        role="dialog"
        aria-modal="false"
        tabindex="-1"
        aria-label="Inventory and equipment"
        @pointerdown.stop="focusSurface"
        @click.stop
        @keydown.stop="onKey"
        @keyup.stop
    >
        <section class="inventory-overlay__equipment" aria-label="Equipment">
            <header class="inventory-overlay__header">
                <h2>Equipped</h2>
            </header>

            <div class="equipment-slots">
                <button
                    v-for="slot in equipmentSlots"
                    :key="slot"
                    class="equipment-slot"
                    type="button"
                    @click="unequip(slot)"
                >
                    <span class="equipment-slot__label">{{
                        slot === 'weapon' ? 'Weapon' : 'Boots'
                    }}</span>
                    <span class="equipment-slot__socket">
                        <img
                            v-if="character.equipment[slot]"
                            class="item-icon"
                            :src="itemAssetCatalog[character.equipment[slot].itemId].src"
                            :alt="itemName(character.equipment[slot])"
                        />
                    </span>
                    <ItemCondition
                        v-if="character.equipment[slot]"
                        :item="character.equipment[slot]"
                    />
                </button>
            </div>
        </section>

        <section class="inventory-overlay__inventory" aria-label="Inventory">
            <header class="inventory-overlay__header">
                <h2>Inventory</h2>
                <span class="inventory-capacity" aria-label="Занято слотов"
                    >{{ character.inventory.length }} / {{ INVENTORY_CAPACITY }}</span
                >
                <button
                    class="inventory-overlay__close"
                    type="button"
                    aria-label="Close inventory"
                    @click="emit('close')"
                >
                    ×
                </button>
            </header>

            <p class="inventory-gold" aria-label="Золото">Золото: {{ gold ?? '—' }} ◈</p>
            <div class="inventory-grid" aria-label="Inventory slots">
                <button
                    v-for="(item, index) in inventorySlots"
                    :key="index"
                    class="inventory-slot"
                    :data-filled="Boolean(item)"
                    :data-item-instance-id="item?.instanceId"
                    :class="{
                        'inventory-slot--selected':
                            Boolean(item) && item?.instanceId === selectedItemId,
                    }"
                    type="button"
                    :aria-label="item === undefined ? `Empty slot ${index + 1}` : itemName(item)"
                    :title="item ? itemName(item) : undefined"
                    @focus="focusedItemId = item?.instanceId"
                    @click="selectItem(item)"
                >
                    <img
                        v-if="item"
                        class="item-icon"
                        :src="itemAssetCatalog[item.itemId].src"
                        :alt="itemName(item)"
                    />
                    <span
                        v-if="item && (item.quantity ?? 1) > 1"
                        class="item-quantity"
                        aria-hidden="true"
                        >{{ item.quantity }}</span
                    >
                </button>
            </div>

            <div v-if="!selectedItem && inspectedItem" class="inventory-inspection">
                <strong>{{ itemName(inspectedItem) }}</strong
                ><ItemCondition :item="inspectedItem" />
            </div>
            <InventoryItemDetails
                v-if="selectedItem"
                :item="selectedItem"
                :has-nearby-chest="hasNearbyChest"
                @inventory-action="emit('inventoryAction', $event)"
                @assign-hotbar="assignHotbar($event, selectedItem)"
                @plant="emit('plant')"
            />
            <p v-if="assignedSlot !== undefined" class="inventory-hotbar-help" role="status">
                {{ selectedItem?.itemId === 'sapling' ? 'Саженец назначен' : 'Яблоко назначено' }} в
                слот {{ assignedSlot + 1 }}. Закройте инвентарь и нажмите {{ assignedSlot + 1 }}.
            </p>
        </section>
    </aside>
</template>

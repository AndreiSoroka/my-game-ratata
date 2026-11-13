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
    ITEM_DEFINITIONS,
    type ItemInstanceSnapshot,
    type WorldChestSnapshot,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'
import { inventoryKey } from './inventoryKeyboard'
import { itemStackLabel } from './itemLabels'
import { useInventoryFocus } from './useInventoryFocus'

const props = defineProps<{
    character: CharacterSnapshot
    chests: WorldChestSnapshot[]
    materials?: AdventureMaterials
}>()

const emit = defineEmits<{
    close: []
    assignHotbar: [payload: { slot: number; itemId: 'food' }]
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
const assignedSlot = ref<number>()
const equipmentSlots: EquipmentSlotId[] = ['weapon', 'boots']
const inventorySlots = computed(() =>
    Array.from({ length: INVENTORY_CAPACITY }, (_, index) => props.character.inventory[index])
)
const selectedItem = computed(() =>
    props.character.inventory.find((item) => item.instanceId === selectedItemId.value)
)
const hasNearbyChest = computed(() =>
    props.chests.some(
        (chest) =>
            chest.kind !== 'corpse' &&
            chestInteractionDistance(props.character.position, chest.position) <=
                CHEST_INTERACTION_RANGE
    )
)

watch(selectedItemId, () => {
    assignedSlot.value = undefined
})

function assignHotbar(slot: number, item: ItemInstanceSnapshot | undefined): void {
    if (item?.itemId !== 'food') return
    emit('assignHotbar', { slot, itemId: 'food' })
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

function canEat(item: ItemInstanceSnapshot): boolean {
    return ITEM_DEFINITIONS[item.itemId].healHp !== undefined
}

function canEquip(item: ItemInstanceSnapshot): boolean {
    return ITEM_DEFINITIONS[item.itemId].equipmentSlots !== undefined
}

function sendInventoryAction(action: InventoryActionKind): void {
    const item = selectedItem.value

    if (item === undefined) {
        return
    }

    emit('inventoryAction', {
        action,
        itemInstanceId: item.instanceId,
    })
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

function slotLabel(slot: EquipmentSlotId): string {
    return slot === 'weapon' ? 'Weapon' : 'Boots'
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
                    <span class="equipment-slot__label">{{ slotLabel(slot) }}</span>
                    <span class="equipment-slot__socket">
                        <img
                            v-if="character.equipment[slot]"
                            class="item-icon"
                            :src="itemAssetCatalog[character.equipment[slot].itemId].src"
                            :alt="itemName(character.equipment[slot])"
                        />
                    </span>
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

            <div v-if="selectedItem" class="inventory-actions">
                <strong>{{ itemName(selectedItem) }}</strong>
                <small v-if="(ITEM_DEFINITIONS[selectedItem.itemId].maxStack ?? 1) > 1"
                    >До {{ ITEM_DEFINITIONS[selectedItem.itemId].maxStack }} в одном слоте</small
                >
                <p
                    v-if="ITEM_DEFINITIONS[selectedItem.itemId].description"
                    class="inventory-item-description"
                >
                    {{ ITEM_DEFINITIONS[selectedItem.itemId].description }}
                </p>
                <button
                    v-if="canEat(selectedItem)"
                    type="button"
                    @click="sendInventoryAction('eat')"
                >
                    Eat
                </button>
                <button
                    v-if="canEquip(selectedItem)"
                    type="button"
                    @click="sendInventoryAction('equip')"
                >
                    Equip
                </button>
                <button type="button" @click="sendInventoryAction('drop')">Drop</button>
                <button v-if="hasNearbyChest" type="button" @click="sendInventoryAction('stash')">
                    Put in chest
                </button>
                <template v-if="selectedItem.itemId === 'food'">
                    <p class="inventory-hotbar-help">Быстрый доступ · Shift+1–4</p>
                    <div
                        class="inventory-hotbar-slots"
                        role="group"
                        aria-label="Назначить яблоко в быстрый слот"
                    >
                        <button
                            v-for="slot in 4"
                            :key="slot"
                            type="button"
                            :aria-label="`Назначить яблоко в слот ${slot}`"
                            @click="assignHotbar(slot - 1, selectedItem)"
                        >
                            {{ slot }}
                        </button>
                    </div>
                </template>
            </div>
            <p v-if="assignedSlot !== undefined" class="inventory-hotbar-help" role="status">
                Яблоко назначено в слот {{ assignedSlot + 1 }}. Закройте инвентарь и нажмите
                {{ assignedSlot + 1 }}, чтобы съесть.
            </p>
        </section>
    </aside>
</template>

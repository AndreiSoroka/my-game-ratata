<script setup lang="ts">
import './inventoryOverlay.css'

import {
    type CharacterSnapshot,
    type EquipmentActionKind,
    type EquipmentSlotId,
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type ItemInstanceSnapshot,
    type WorldChestSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'

const props = defineProps<{
    character: CharacterSnapshot
    chests: WorldChestSnapshot[]
}>()

const emit = defineEmits<{
    close: []
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

const selectedItemId = ref<string>()
const equipmentSlots: EquipmentSlotId[] = ['weapon', 'boots']
const inventorySlots = computed(() =>
    Array.from({ length: 50 }, (_, index) => props.character.inventory[index])
)
const selectedItem = computed(() =>
    props.character.inventory.find((item) => item.instanceId === selectedItemId.value)
)
const hasNearbyChest = computed(() =>
    props.chests.some(
        (chest) =>
            Math.hypot(
                chest.position.x - props.character.position.x,
                chest.position.y - props.character.position.y
            ) <= 28
    )
)

watch(
    () => props.character.inventory.map((item) => item.instanceId).join('|'),
    () => {
        if (
            selectedItemId.value !== undefined &&
            !props.character.inventory.some((item) => item.instanceId === selectedItemId.value)
        ) {
            selectedItemId.value = undefined
        }
    }
)

function selectItem(item: ItemInstanceSnapshot | undefined): void {
    if (item === undefined) {
        selectedItemId.value = undefined
        return
    }

    selectedItemId.value = selectedItemId.value === item.instanceId ? undefined : item.instanceId
}

function itemName(item: ItemInstanceSnapshot): string {
    return ITEM_DEFINITIONS[item.itemId].name
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
    <aside class="inventory-overlay" aria-label="Inventory and equipment">
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
                    :key="item?.instanceId ?? index"
                    class="inventory-slot"
                    :class="{
                        'inventory-slot--selected': item?.instanceId === selectedItemId,
                    }"
                    type="button"
                    :aria-label="item === undefined ? `Empty slot ${index + 1}` : itemName(item)"
                    @click="selectItem(item)"
                >
                    <img
                        v-if="item"
                        class="item-icon"
                        :src="itemAssetCatalog[item.itemId].src"
                        :alt="itemName(item)"
                    />
                </button>
            </div>

            <div v-if="selectedItem" class="inventory-actions">
                <strong>{{ itemName(selectedItem) }}</strong>
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
            </div>
        </section>
    </aside>
</template>

<script setup lang="ts">
import {
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type ItemInstanceSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import ItemCondition from './ItemCondition.vue'
import { itemStackLabel } from './itemLabels'
const props = defineProps<{ item: ItemInstanceSnapshot; hasNearbyChest: boolean }>()
const emit = defineEmits<{
    inventoryAction: [payload: { action: InventoryActionKind; itemInstanceId: string }]
    assignHotbar: [slot: number]
    plant: []
}>()
const definition = computed(() => ITEM_DEFINITIONS[props.item.itemId])
function act(action: InventoryActionKind): void {
    emit('inventoryAction', { action, itemInstanceId: props.item.instanceId })
}
</script>
<template>
    <div class="inventory-actions">
        <strong>{{ itemStackLabel(item) }}</strong>
        <ItemCondition :item="item" />
        <button v-if="item.itemId === 'sapling'" type="button" @click="emit('plant')">
            Посадить дерево
        </button>
        <small v-if="(definition.maxStack ?? 1) > 1"
            >До {{ definition.maxStack }} в одном слоте</small
        >
        <p v-if="definition.description" class="inventory-item-description">
            {{ definition.description }}
        </p>
        <button v-if="definition.healHp !== undefined" type="button" @click="act('eat')">
            Eat
        </button>
        <button v-if="definition.equipmentSlots !== undefined" type="button" @click="act('equip')">
            Equip
        </button>
        <button type="button" @click="act('drop')">Drop</button>
        <button v-if="hasNearbyChest" type="button" @click="act('stash')">Put in chest</button>
        <template v-if="item.itemId === 'food'">
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
                    @click="emit('assignHotbar', slot - 1)"
                >
                    {{ slot }}
                </button>
            </div>
        </template>
    </div>
</template>

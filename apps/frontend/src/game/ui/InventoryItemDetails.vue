<script setup lang="ts">
import {
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type ItemInstanceSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import ItemCondition from './ItemCondition.vue'
import { itemStackLabel } from './itemLabels'
import GameButton from './primitives/GameButton.vue'
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
        <GameButton v-if="item.itemId === 'sapling'" type="button" @click="emit('plant')">
            Посадить дерево
        </GameButton>
        <small v-if="(definition.maxStack ?? 1) > 1"
            >До {{ definition.maxStack }} в одном слоте</small
        >
        <p v-if="definition.description" class="inventory-item-description">
            {{ definition.description }}
        </p>
        <GameButton
            variant="success"
            v-if="definition.healHp !== undefined"
            type="button"
            @click="act('eat')"
        >
            Eat
        </GameButton>
        <GameButton
            variant="primary"
            v-if="definition.equipmentSlots !== undefined"
            type="button"
            @click="act('equip')"
        >
            Equip
        </GameButton>
        <GameButton variant="danger" type="button" @click="act('drop')">Drop</GameButton>
        <GameButton v-if="hasNearbyChest" type="button" @click="act('stash')"
            >Put in chest</GameButton
        >
        <template v-if="item.itemId === 'food' || item.itemId === 'sapling'">
            <p class="inventory-hotbar-help">Быстрый доступ · Shift+1–4</p>
            <div
                class="inventory-hotbar-slots"
                role="group"
                :aria-label="`Назначить ${item.itemId === 'sapling' ? 'саженец' : 'яблоко'} в быстрый слот`"
            >
                <GameButton
                    v-for="slot in 4"
                    :key="slot"
                    type="button"
                    :aria-label="`Назначить ${item.itemId === 'sapling' ? 'саженец' : 'яблоко'} в слот ${slot}`"
                    @click="emit('assignHotbar', slot - 1)"
                >
                    {{ slot }}
                </GameButton>
            </div>
        </template>
    </div>
</template>

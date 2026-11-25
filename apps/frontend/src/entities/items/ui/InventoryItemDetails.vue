<script setup lang="ts">
import {
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type ItemInstanceSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { itemDescription, tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'

import { itemStackLabel } from '../model/itemLabels'
import ItemCondition from './ItemCondition.vue'
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
        <UiButton
            size="small"
            v-if="item.itemId === 'sapling'"
            type="button"
            @click="emit('plant')"
        >
            {{ tGame('game.character.plantTree') }}
        </UiButton>
        <small v-if="(definition.maxStack ?? 1) > 1"
            >{{ tGame('game.character.up') }} {{ definition.maxStack }}
            {{ tGame('game.character.inOneSlot') }}</small
        >
        <p v-if="definition.description" class="inventory-item-description">
            {{ itemDescription(item.itemId) }}
        </p>
        <UiButton
            size="small"
            variant="success"
            v-if="definition.healHp !== undefined"
            type="button"
            @click="act('eat')"
        >
            {{ tGame('game.character.eatItem') }}
        </UiButton>
        <UiButton
            size="small"
            variant="primary"
            v-if="definition.equipmentSlots !== undefined"
            type="button"
            @click="act('equip')"
        >
            {{ tGame('game.character.equipItem') }}
        </UiButton>
        <UiButton size="small" variant="danger" type="button" @click="act('drop')">{{
            tGame('game.character.dropItem')
        }}</UiButton>
        <UiButton size="small" v-if="hasNearbyChest" type="button" @click="act('stash')">{{
            tGame('game.character.stashItem')
        }}</UiButton>
        <template v-if="item.itemId === 'food' || item.itemId === 'sapling'">
            <p class="inventory-hotbar-help">{{ tGame('game.character.quickAccessShift') }}</p>
            <div
                class="inventory-hotbar-slots"
                role="group"
                :aria-label="
                    tGame('game.character.assignItemQuickSlot', {
                        item:
                            item.itemId === 'sapling'
                                ? tGame('game.character.saplingAccusative')
                                : tGame('game.character.appleAccusative'),
                    })
                "
            >
                <UiButton
                    size="small"
                    v-for="slot in 4"
                    :key="slot"
                    type="button"
                    :aria-label="
                        tGame('game.character.assignItemSlot', {
                            item:
                                item.itemId === 'sapling'
                                    ? tGame('game.character.saplingAccusative')
                                    : tGame('game.character.appleAccusative'),
                            slot: slot,
                        })
                    "
                    @click="emit('assignHotbar', slot - 1)"
                >
                    {{ slot }}
                </UiButton>
            </div>
        </template>
    </div>
</template>

<style scoped>
.inventory-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    margin-top: 10px;
    color: var(--ui-dark-panel-text);
}
.inventory-actions strong {
    color: var(--ui-dark-panel-title);
    font-size: 13px;
}
.inventory-item-description {
    margin: 2px 0 6px;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.inventory-hotbar-help {
    margin: 4px 0 0;
    font:
        14px/1.4 system-ui,
        sans-serif;
}
.inventory-hotbar-slots {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
}
.inventory-hotbar-slots button {
    min-height: 36px;
}
</style>

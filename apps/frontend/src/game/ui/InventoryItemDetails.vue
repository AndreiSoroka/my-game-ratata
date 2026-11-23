<script setup lang="ts">
import {
    type InventoryActionKind,
    ITEM_DEFINITIONS,
    type ItemInstanceSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { itemDescription, tGame } from '@/shared/lib/i18n'

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
            {{ tGame('game.character.plantTree') }}
        </GameButton>
        <small v-if="(definition.maxStack ?? 1) > 1"
            >{{ tGame('game.character.up') }} {{ definition.maxStack }}
            {{ tGame('game.character.inOneSlot') }}</small
        >
        <p v-if="definition.description" class="inventory-item-description">
            {{ itemDescription(item.itemId) }}
        </p>
        <GameButton
            variant="success"
            v-if="definition.healHp !== undefined"
            type="button"
            @click="act('eat')"
        >
            {{ tGame('game.character.eatItem') }}
        </GameButton>
        <GameButton
            variant="primary"
            v-if="definition.equipmentSlots !== undefined"
            type="button"
            @click="act('equip')"
        >
            {{ tGame('game.character.equipItem') }}
        </GameButton>
        <GameButton variant="danger" type="button" @click="act('drop')">{{
            tGame('game.character.dropItem')
        }}</GameButton>
        <GameButton v-if="hasNearbyChest" type="button" @click="act('stash')">{{
            tGame('game.character.stashItem')
        }}</GameButton>
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
                <GameButton
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
                </GameButton>
            </div>
        </template>
    </div>
</template>

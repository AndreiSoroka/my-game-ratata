<script setup lang="ts">
import type {
    CharacterSnapshot,
    EquipmentActionKind,
    EquipmentSlotId,
    InventoryActionKind,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import GameHud from './GameHud.vue'
import InventoryOverlay from './InventoryOverlay.vue'

defineProps<{
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    inventoryOpen: boolean
}>()
const emit = defineEmits<{
    openMenu: []
    closeInventory: []
    plant: []
    assignHotbar: [payload: { slot: number; itemId: 'food' | 'sapling' }]
    equipmentAction: [payload: { action: EquipmentActionKind; slot: EquipmentSlotId }]
    inventoryAction: [payload: { action: InventoryActionKind; itemInstanceId: string }]
}>()
</script>

<template>
    <GameHud :snapshot="snapshot" :player="player" @open-menu="emit('openMenu')">
        <template #surface><slot name="surface" /></template>
        <InventoryOverlay
            v-if="inventoryOpen && player"
            :character="player"
            :chests="snapshot?.chests ?? []"
            :gold="snapshot?.adventure?.gold"
            @close="emit('closeInventory')"
            @plant="emit('plant')"
            @assign-hotbar="emit('assignHotbar', $event)"
            @equipment-action="emit('equipmentAction', $event)"
            @inventory-action="emit('inventoryAction', $event)"
        />
    </GameHud>
</template>

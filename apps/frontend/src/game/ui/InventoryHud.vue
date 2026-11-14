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

const props = defineProps<{
    nickname: string
    status: string
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    localPlayerId: string | undefined
    inventoryOpen: boolean
    testMode: boolean
}>()
const emit = defineEmits<{
    toggleInventory: []
    openMenu: []
    createMarker: []
    closeInventory: []
    plant: []
    assignHotbar: [payload: { slot: number; itemId: 'food' }]
    equipmentAction: [payload: { action: EquipmentActionKind; slot: EquipmentSlotId }]
    inventoryAction: [payload: { action: InventoryActionKind; itemInstanceId: string }]
}>()
</script>

<template>
    <GameHud
        v-bind="props"
        @toggle-inventory="emit('toggleInventory')"
        @open-menu="emit('openMenu')"
        @create-marker="emit('createMarker')"
    >
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

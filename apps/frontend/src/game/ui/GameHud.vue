<script setup lang="ts">
import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'

import GamePlayerStatus from './GamePlayerStatus.vue'
import GameButton from './primitives/GameButton.vue'
import { activateFocusedButton } from './uiKeyboard'
import WorldLocationPanel from './WorldLocationPanel.vue'

defineProps<{
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    inventoryOpen: boolean
}>()
const emit = defineEmits<{ toggleInventory: []; openMenu: [] }>()
</script>

<template>
    <WorldLocationPanel v-if="snapshot?.location && !inventoryOpen" :location="snapshot.location" />
    <slot name="surface" />
    <GamePlayerStatus
        v-if="player"
        :key="player.id"
        :character="player"
        :server-time="snapshot?.serverTime"
    />
    <slot />
    <div class="bottom-actions" aria-label="Actions">
        <GameButton
            class="bottom-actions__button"
            :class="{ 'bottom-actions__button--active': inventoryOpen }"
            :aria-pressed="inventoryOpen"
            @click="emit('toggleInventory')"
            @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
        >
            Inventory
        </GameButton>
        <GameButton
            icon
            class="bottom-actions__menu"
            aria-label="Игровое меню"
            title="Меню · Esc"
            @click="emit('openMenu')"
            @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
        >
            ☰
        </GameButton>
    </div>
</template>

<style scoped>
.bottom-actions__menu {
    min-width: 40px;
    min-height: 40px;
}
</style>

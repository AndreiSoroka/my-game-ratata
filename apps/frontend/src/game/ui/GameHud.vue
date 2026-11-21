<script setup lang="ts">
import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'

import GameMenuButton from './GameMenuButton.vue'
import GamePlayerStatus from './GamePlayerStatus.vue'
import WorldLocationPanel from './WorldLocationPanel.vue'

defineProps<{
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    inventoryOpen: boolean
}>()
const emit = defineEmits<{ openMenu: [] }>()
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
    <GameMenuButton v-if="!snapshot || !player" class="startup-menu" @open="emit('openMenu')" />
</template>

<style scoped>
.startup-menu {
    position: absolute;
    bottom: var(--game-hotbar-bottom);
    left: 50%;
    z-index: 3;
    transform: translateX(-50%);
}
</style>

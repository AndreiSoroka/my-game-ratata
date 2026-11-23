<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'

import AdventurePanel from '@/game/ui/AdventurePanel.vue'

defineProps<{
    snapshot: WorldSnapshot
    characters: CharacterSnapshot[]
    player: CharacterSnapshot
    inventoryOpen: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
</script>

<template>
    <AdventurePanel
        v-if="snapshot.adventure"
        :adventure="snapshot.adventure"
        :characters="characters"
        :inventory-open="inventoryOpen"
        :player="player"
        :server-time="snapshot.serverTime"
        @command="emit('command', $event)"
    />
</template>

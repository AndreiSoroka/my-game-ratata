<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'

import AdventurePanel from '@/game/ui/AdventurePanel.vue'
import { NpcConversationComposer } from '@/pages/game'

defineProps<{
    snapshot: WorldSnapshot
    characters: CharacterSnapshot[]
    player: CharacterSnapshot
    inventoryOpen: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
function talk(targetId: string, text: string): void {
    emit('command', { type: 'companion_request', request: 'talk', targetId, text })
}
</script>

<template>
    <AdventurePanel
        v-if="snapshot.adventure"
        :adventure="snapshot.adventure"
        :characters="characters"
        :inventory-open="inventoryOpen"
        :player="player"
        :server-time="snapshot.serverTime"
        :speech-activity="snapshot.social?.speechActivity"
        @command="emit('command', $event)"
    >
        <template #composer="{ targetId, waiting }">
            <NpcConversationComposer
                :target-id="targetId"
                :waiting="waiting"
                @send="talk(targetId, $event)"
            />
        </template>
    </AdventurePanel>
</template>

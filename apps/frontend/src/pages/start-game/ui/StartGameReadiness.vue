<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'

import type { StartGameStatus } from '../model/useStartGameReadiness'

defineProps<{ status: StartGameStatus }>()
const messages = {
    checking: 'game.worldSettings.aiChecking',
    ai_unavailable: 'game.worldSettings.aiUnavailable',
    connection_error: 'game.worldSettings.serverConnection',
} as const
</script>

<template>
    <p class="start-game-readiness" :data-state="status" role="status">
        {{ status === 'ready' ? '' : tGame(messages[status]) }}
    </p>
</template>

<style scoped>
.start-game-readiness {
    margin: 10px 0 0;
    color: #e3cd9d;
    font-size: 0.875rem;
}
.start-game-readiness:empty {
    margin: 0;
}
.start-game-readiness[data-state='connection_error'],
.start-game-readiness[data-state='ai_unavailable'] {
    color: #ffb2a6;
}
</style>

<script setup lang="ts">
import './gameNotice.css'

import GameFrame from './primitives/GameFrame.vue'

defineProps<{ text: string }>()
</script>

<template>
    <p class="game-notice game-frame-host" role="status" aria-live="polite">
        <GameFrame variant="panel" />{{ text }}
    </p>
</template>

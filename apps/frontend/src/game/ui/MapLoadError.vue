<script setup lang="ts">
import type { RatataGame } from '../runtime/ratataGame'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'

defineProps<{ message: string; status: string; game?: RatataGame }>()
</script>
<template>
    <p v-if="message" class="game-error game-frame-host" role="alert">
        <GameFrame variant="panel" />
        {{
            status === 'Map loading failed'
                ? 'Не удалось загрузить местность. Проверьте соединение и повторите попытку.'
                : message
        }}
        <GameButton v-if="status === 'Map loading failed'" @click="game?.retryMap()">
            Повторить загрузку карты
        </GameButton>
    </p>
</template>
<style scoped>
.game-error {
    z-index: 150;
    top: 50%;
    right: auto;
    bottom: auto;
    left: 50%;
    display: grid;
    gap: 12px;
    width: min(420px, calc(100vw - 28px));
    margin: 0;
    overflow-wrap: anywhere;
    transform: translate(-50%, -50%);
}
</style>

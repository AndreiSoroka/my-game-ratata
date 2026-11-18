<script setup lang="ts">
import type { RatataGame } from '../runtime/ratataGame'

defineProps<{ message: string; status: string; game?: RatataGame }>()
</script>
<template>
    <p v-if="message" class="game-error" role="alert">
        {{
            status === 'Map loading failed'
                ? 'Не удалось загрузить местность. Проверьте соединение и повторите попытку.'
                : message
        }}
        <button v-if="status === 'Map loading failed'" type="button" @click="game?.retryMap()">
            Повторить загрузку карты
        </button>
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

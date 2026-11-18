<script setup lang="ts">
import GameButton from '../ui/primitives/GameButton.vue'
import GameFrame from '../ui/primitives/GameFrame.vue'
defineProps<{ count: number; total: number }>()
const emit = defineEmits<{ clear: []; all: []; reset: [] }>()
</script>
<template>
    <section class="build-toolbar game-frame-host" aria-label="Сборка персонажа">
        <GameFrame variant="panel" />
        <p data-testid="debug-build-count">
            В наборе: <strong>{{ count }}</strong> из {{ total }}
        </p>
        <div>
            <GameButton size="compact" data-testid="debug-build-clear" @click="emit('clear')">
                Отключить все
            </GameButton>
            <GameButton size="compact" data-testid="debug-build-all" @click="emit('all')">
                Включить все
            </GameButton>
            <GameButton size="compact" data-testid="debug-build-reset" @click="emit('reset')">
                Набор класса
            </GameButton>
        </div>
    </section>
</template>
<style scoped>
.build-toolbar {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    align-items: center;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
    padding: 12px;
    border: 1px solid transparent;
}
p {
    margin: 0;
    color: #b8cbd3;
    font-size: 13px;
}
strong {
    color: #f0d89c;
}
div {
    display: contents;
}
button {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid transparent;
    cursor: pointer;
}
@media (max-width: 650px) {
    .build-toolbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>

<script setup lang="ts">
import { UiButton, UiFrame } from '@/shared/ui/common'
defineProps<{ count: number; total: number }>()
const emit = defineEmits<{ clear: []; all: []; reset: [] }>()
</script>
<template>
    <section class="build-toolbar game-frame-host" aria-label="Сборка персонажа">
        <UiFrame variant="panel" />
        <p data-testid="debug-build-count">
            В наборе: <strong>{{ count }}</strong> из {{ total }}
        </p>
        <div>
            <UiButton size="compact" data-testid="debug-build-clear" @click="emit('clear')">
                Отключить все
            </UiButton>
            <UiButton size="compact" data-testid="debug-build-all" @click="emit('all')">
                Включить все
            </UiButton>
            <UiButton size="compact" data-testid="debug-build-reset" @click="emit('reset')">
                Набор класса
            </UiButton>
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

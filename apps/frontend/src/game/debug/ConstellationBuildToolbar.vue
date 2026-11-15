<script setup lang="ts">
defineProps<{ count: number }>()
const emit = defineEmits<{ clear: []; all: []; reset: [] }>()
</script>
<template>
    <section class="build-toolbar" aria-label="Сборка персонажа">
        <p data-testid="debug-build-count">
            В наборе: <strong>{{ count }}</strong> из 77
        </p>
        <div>
            <button type="button" data-testid="debug-build-clear" @click="emit('clear')">
                Отключить все
            </button>
            <button type="button" data-testid="debug-build-all" @click="emit('all')">
                Включить все
            </button>
            <button type="button" data-testid="debug-build-reset" @click="emit('reset')">
                Набор класса
            </button>
        </div>
    </section>
</template>
<style scoped>
.build-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    align-items: center;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
    padding: 12px;
    border: 1px solid #405d6a;
    background: #0d202b;
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
    border: 1px solid #55717d;
    background: #102733;
    color: #eee6d2;
    font: inherit;
    cursor: pointer;
}
button:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 2px;
}
@media (max-width: 650px) {
    .build-toolbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>

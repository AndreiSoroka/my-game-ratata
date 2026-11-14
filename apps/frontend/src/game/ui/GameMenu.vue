<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import { dialogActionKeys } from './dialogActionKeys'
import { useEscapeOwner } from './uiEscapeOwners'

withDefaults(defineProps<{ automationAvailable?: boolean }>(), { automationAvailable: true })
const emit = defineEmits<{ resume: []; leave: []; markers: []; scenarios: [] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({ active: () => true, escape: () => emit('resume'), element: panel, priority: 200 })
onMounted(async () => {
    await nextTick()
    panel.value?.querySelector<HTMLButtonElement>('button')?.focus()
})
</script>

<template>
    <div class="game-menu-backdrop" @pointerdown.self.prevent.stop @click.self.stop>
        <section
            ref="panel"
            class="game-menu rpg-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Игровое меню"
            tabindex="-1"
            @keydown.stop="dialogActionKeys($event, panel, () => emit('resume'))"
            @keyup.stop
        >
            <h2>Игровое меню</h2>
            <p>Мир продолжает жить, пока открыто меню.</p>
            <button type="button" data-dialog-action="resume" @click="emit('resume')">
                Вернуться в игру
            </button>
            <button
                type="button"
                data-dialog-action="markers"
                :disabled="!automationAvailable"
                @click="emit('markers')"
            >
                Метки
            </button>
            <button
                type="button"
                data-dialog-action="scenarios"
                :disabled="!automationAvailable"
                @click="emit('scenarios')"
            >
                Сценарии
            </button>
            <button type="button" data-dialog-action="leave" @click="emit('leave')">
                Выйти из игры
            </button>
        </section>
    </div>
</template>

<style scoped>
.game-menu-backdrop {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 16px;
    background: #0b151ab3;
}
.game-menu {
    display: grid;
    gap: 12px;
    width: min(340px, 100%);
    max-height: calc(100dvh - 32px);
    overflow: auto;
    padding: 20px;
    color: var(--rpg-text);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
h2,
p {
    margin: 0;
}
p {
    color: #c4cbbb;
}
button {
    min-height: 44px;
    padding: 10px 14px;
    color: inherit;
    font: inherit;
    background: #35433b;
    border: 1px solid #bca575;
    cursor: pointer;
}
button:focus-visible {
    outline: 3px solid #f2cc78;
    outline-offset: 2px;
}
</style>

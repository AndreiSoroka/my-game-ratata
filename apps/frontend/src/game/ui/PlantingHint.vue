<script setup lang="ts">
import { computed } from 'vue'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
const props = defineProps<{
    anchor: { x: number; y: number; width: number; height: number }
    available: boolean
    approaching: boolean
    status: string
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const style = computed(() => ({
    left: `${Math.max(8, Math.min(props.anchor.width - Math.min(264, props.anchor.width - 16) - 8, props.anchor.x + 18))}px`,
    top: `${Math.max(8, Math.min(props.anchor.height - 112, props.anchor.y + 18))}px`,
}))
</script>
<template>
    <section
        class="planting-hint rpg-panel game-frame-host"
        :class="{ available }"
        :style="style"
        role="region"
        aria-label="Посадка дерева"
        data-world-pointer-owner
    >
        <GameFrame variant="panel" />
        <strong>{{ approaching ? 'Посадка дерева' : 'Выберите участок' }}</strong>
        <p role="status">{{ status }}</p>
        <div>
            <GameButton v-if="!approaching" :data-available="available" @click="emit('confirm')">
                Посадить · F / Enter
            </GameButton>
            <GameButton @click="emit('cancel')">Отмена · Esc</GameButton>
        </div>
        <small v-if="!approaching">Стрелки · Касание выбирает, повторное — сажает</small>
    </section>
</template>
<style scoped>
.planting-hint {
    position: absolute;
    z-index: 20;
    padding: 8px 10px;
    width: min(264px, calc(100% - 16px));
    box-sizing: border-box;
    font: 11px/1.4 system-ui;
    pointer-events: auto;
}
.planting-hint.available {
    border-color: #e5c553;
}
p {
    margin: 3px 0 6px;
}
small {
    display: block;
    margin-top: 5px;
    opacity: 0.8;
}
div {
    display: flex;
    gap: 6px;
}
button {
    padding: 4px 6px;
}
</style>

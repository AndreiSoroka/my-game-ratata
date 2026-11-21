<script setup lang="ts">
import GameButton from './primitives/GameButton.vue'
import { worldHudButtonAttrs } from './uiKeyboard'

const emit = defineEmits<{ open: [] }>()
</script>

<template>
    <GameButton
        v-bind="worldHudButtonAttrs"
        icon
        class="game-menu-button"
        aria-label="Игровое меню"
        title="Меню · Esc"
        @click="emit('open')"
    >
        ☰
    </GameButton>
</template>

<style scoped>
.game-menu-button {
    inline-size: var(--game-menu-button-size, 40px);
    block-size: var(--game-menu-button-size, 40px);
}
</style>

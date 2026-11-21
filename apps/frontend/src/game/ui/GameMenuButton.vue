<script setup lang="ts">
import GameButton from './primitives/GameButton.vue'
import { activateFocusedButton } from './uiKeyboard'

const emit = defineEmits<{ open: [] }>()
</script>

<template>
    <GameButton
        icon
        class="game-menu-button"
        aria-label="Игровое меню"
        title="Меню · Esc"
        @click="emit('open')"
        @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
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

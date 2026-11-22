<script setup lang="ts">
import { UiButton } from '@/shared/ui/common'

import { worldHudButtonAttrs } from './uiKeyboard'

const emit = defineEmits<{ open: [] }>()
</script>

<template>
    <UiButton
        v-bind="worldHudButtonAttrs"
        appearance="panel"
        panel="panel-001"
        class="game-menu-button"
        aria-label="Игровое меню"
        title="Меню · Esc"
        @click="emit('open')"
    >
        ☰
    </UiButton>
</template>

<style scoped>
.game-menu-button {
    --ui-button-panel-padding: 0;
    min-inline-size: 0;
    min-block-size: 0;
    inline-size: var(--game-menu-button-size, 40px);
    block-size: var(--game-menu-button-size, 40px);
}
</style>

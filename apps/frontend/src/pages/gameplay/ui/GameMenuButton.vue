<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'
import { hudPanelButtonColors, UiButton } from '@/shared/ui/common'

import { worldHudButtonAttrs } from '../model/uiKeyboard'

const emit = defineEmits<{ open: [] }>()
</script>

<template>
    <UiButton
        v-bind="worldHudButtonAttrs"
        appearance="panel"
        panel="panel-001"
        :colors="hudPanelButtonColors"
        class="game-menu-button"
        :aria-label="tGame('game.menu.dialog')"
        :title="tGame('game.menu.shortcut')"
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

<script setup lang="ts">
import type { WorldEmptyMode } from '@my-game-ratata/contracts'
import { nextTick, useTemplateRef, watchEffect } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import type { AdminAccessState } from '../model/useWorldAdministration'
import AdminAccess from './AdminAccess.vue'
import WorldModePanel from './WorldModePanel.vue'

const props = defineProps<{
    access: AdminAccessState
    busy: boolean
    error: string
    open: boolean
    mode?: WorldEmptyMode
}>()
const emit = defineEmits<{
    code: [code: string]
    open: []
    close: []
    save: [mode: WorldEmptyMode]
}>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const adminAccess = useTemplateRef<InstanceType<typeof AdminAccess>>('adminAccess')
function onDialogClose(): void {
    if (props.open) emit('close')
    void nextTick(() => adminAccess.value?.focusAdmin())
}
watchEffect(
    () => {
        const element = dialog.value
        if (!element) return
        if (props.open && !element.open) element.showModal()
        else if (!props.open && element.open) element.close()
    },
    { flush: 'post' }
)
</script>

<template>
    <details class="start-game-settings">
        <summary>{{ tGame('game.worldSettings.advanced') }}</summary>
        <AdminAccess
            ref="adminAccess"
            :access="access"
            :busy="busy"
            :error="open ? '' : error"
            @code="emit('code', $event)"
            @open="emit('open')"
        />
    </details>
    <dialog
        ref="dialog"
        class="world-mode-modal"
        :aria-label="tGame('game.worldSettings.title')"
        @close="onDialogClose"
    >
        <WorldModePanel
            v-if="open"
            :mode="mode"
            :loading="busy && mode === undefined"
            :saving="busy && mode !== undefined"
            :error="error"
            @save="emit('save', $event)"
            @close="emit('close')"
        />
    </dialog>
</template>

<style scoped>
.start-game-settings {
    display: block;
    width: fit-content;
    margin-block-start: 20px;
    text-align: start;
    font:
        0.875rem/1.5 system-ui,
        sans-serif;
}
.start-game-settings summary {
    margin-block-end: 8px;
    color: #e3cd9d;
    cursor: pointer;
}
.start-game-settings summary:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
}
.world-mode-modal {
    box-sizing: border-box;
    inline-size: min(460px, calc(100vw - 24px));
    max-block-size: calc(100dvh - 24px);
    margin: auto;
    padding: 0;
    overflow: auto;
    border: 0;
    border-radius: 4px;
    background: transparent;
    text-shadow: none;
    font:
        1rem/1.4 system-ui,
        sans-serif;
}
.world-mode-modal::backdrop {
    background: #080e0de0;
}
@media (max-width: 820px) {
    .start-game-settings {
        margin-inline: auto;
    }
}
</style>

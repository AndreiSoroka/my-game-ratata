<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import { DarkWindowFrame } from '@/shared/ui/common'

import { activateFocusedButton, navigatePanelFocus } from '../model/uiKeyboard'
import { useDialogEscape } from '../model/useDialogEscape'

defineProps<{ title: string }>()
defineSlots<{ default?: () => unknown }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
useDialogEscape(panel, () => emit('close'))
function key(event: KeyboardEvent): void {
    if (activateFocusedButton(event, panel.value) || navigatePanelFocus(event, panel.value)) return
    if (event.code !== 'Tab') return
    const fields = Array.from(
        panel.value?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        ) ?? []
    )
    const index = fields.indexOf(document.activeElement as HTMLElement)
    if (event.shiftKey ? index <= 0 : index === fields.length - 1) {
        event.preventDefault()
        fields[event.shiftKey ? fields.length - 1 : 0]?.focus()
    }
}
onMounted(async () => {
    await nextTick()
    panel.value?.focus()
})
</script>

<template>
    <section
        ref="panel"
        class="automation-window"
        role="dialog"
        :aria-label="title"
        tabindex="-1"
        @keydown.stop="key"
        @keyup.stop
    >
        <DarkWindowFrame :title="title" @close="emit('close')">
            <slot />
        </DarkWindowFrame>
    </section>
</template>

<style scoped>
.automation-window {
    position: absolute;
    inset: 56px 16px auto auto;
    z-index: 50;
    --dark-window-max-block-size: calc(100dvh - 140px);
    display: flex;
    width: min(620px, calc(100% - 32px));
    box-sizing: border-box;
    pointer-events: auto;
}
.automation-window:focus-visible {
    outline: 2px solid var(--ui-dark-panel-border);
    outline-offset: 2px;
}
@media (max-width: 600px) {
    .automation-window {
        --dark-window-max-block-size: calc(100dvh - 110px);
        inset: 48px 8px auto;
        width: calc(100% - 16px);
    }
}
</style>

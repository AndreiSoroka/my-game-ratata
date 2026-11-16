<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import { activateFocusedButton } from './uiKeyboard'
import { useDialogEscape } from './useDialogEscape'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
useDialogEscape(panel, () => emit('close'))
function key(event: KeyboardEvent): void {
    if (activateFocusedButton(event, panel.value)) return
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
        class="automation-window rpg-panel"
        role="dialog"
        :aria-label="title"
        tabindex="-1"
        @keydown.stop="key"
        @keyup.stop
    >
        <header class="automation-window__header">
            <h2>{{ title }}</h2>
            <button type="button" :aria-label="`Закрыть: ${title}`" @click="emit('close')">
                ×
            </button>
        </header>
        <slot />
    </section>
</template>

<style scoped>
.automation-window {
    position: absolute;
    inset: 56px 16px auto auto;
    z-index: 50;
    display: grid;
    gap: 14px;
    width: min(620px, calc(100% - 32px));
    max-height: calc(100dvh - 140px);
    overflow: auto;
    padding: 16px;
    box-sizing: border-box;
    pointer-events: auto;
}
.automation-window__header {
    position: sticky;
    top: -16px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    background: var(--rpg-panel);
}
h2 {
    margin: 0;
    font-size: 23px;
}
button {
    min-width: 36px;
    min-height: 36px;
    border: 1px solid var(--rpg-brass);
    background: #35433b;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
@media (max-width: 600px) {
    .automation-window {
        inset: 48px 8px auto;
        width: calc(100% - 16px);
        max-height: calc(100dvh - 110px);
        padding: 12px;
    }
    .automation-window__header {
        top: -12px;
    }
}
</style>

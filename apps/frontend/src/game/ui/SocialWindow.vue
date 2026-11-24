<script setup lang="ts">
import './socialWindows.css'

import { nextTick, onMounted, ref } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import CloseIcon from './CloseIcon.vue'
import { isConfirmationKey } from './keyboardOwnership'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'

const props = defineProps<{ title: string; modal?: boolean; layout?: 'exchange' | 'quest' }>()
const emit = defineEmits<{ close: [] }>()
defineSlots<{ default: () => unknown; below?: () => unknown }>()
const panel = ref<HTMLElement>()
useEscapeOwner({
    active: () => true,
    escape: () => emit('close'),
    element: panel,
    priority: props.modal ? 130 : 110,
})
function repeatConfirmation(event: KeyboardEvent): boolean {
    return (
        event.repeat &&
        isConfirmationKey(event) &&
        event.target instanceof HTMLElement &&
        event.target.closest('button') !== null
    )
}
function key(event: KeyboardEvent): void {
    if (repeatConfirmation(event)) {
        event.preventDefault()
        return
    }
    if (event.code !== 'Tab') return
    const fields = Array.from(
        panel.value?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'
        ) ?? []
    )
    if (!fields.length) return
    const index = fields.indexOf(document.activeElement as HTMLElement)
    event.preventDefault()
    const next =
        index < 0
            ? event.shiftKey
                ? fields.length - 1
                : 0
            : (index + (event.shiftKey ? -1 : 1) + fields.length) % fields.length
    fields[next]?.focus()
}
onMounted(async () => {
    await nextTick()
    panel.value?.focus()
})
</script>
<template>
    <div
        class="social-surface"
        :class="{
            'social-surface--modal': modal,
            'social-surface--exchange': layout === 'exchange',
            'social-surface--quest': layout === 'quest',
        }"
        @pointerdown.self="modal && $event.preventDefault()"
    >
        <section
            ref="panel"
            class="social-window-stack"
            :class="{
                'social-window-stack--exchange': layout === 'exchange',
                'quest-window': layout === 'quest',
            }"
            role="dialog"
            :aria-modal="modal || undefined"
            :aria-label="title"
            tabindex="-1"
            @keydown.stop="key"
            @keyup.stop
        >
            <slot v-if="layout === 'quest'" />
            <div
                v-else
                class="social-window game-frame-host"
                :class="{ 'social-window--exchange': layout === 'exchange' }"
            >
                <GameFrame variant="window" />
                <header class="social-window__header">
                    <h2>{{ title }}</h2>
                    <GameButton
                        type="button"
                        class="social-window__close"
                        icon
                        :aria-label="tGame('game.automation.closeWithTitle', { title: title })"
                        @click="emit('close')"
                    >
                        <CloseIcon />
                    </GameButton>
                </header>
                <slot />
            </div>
            <slot name="below" />
        </section>
    </div>
</template>

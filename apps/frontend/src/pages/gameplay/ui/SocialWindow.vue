<script setup lang="ts">
import './socialWindows.css'

import { nextTick, onMounted, ref, watch } from 'vue'

import { isConfirmationKey } from '@/game/ui/keyboardOwnership'
import { DarkWindowFrame } from '@/shared/ui/common'

import { useEscapeOwner } from '../model/uiEscapeOwners'
import {
    activateFocusedButton,
    navigateDialogueActions,
    navigatePanelFocus,
} from '../model/uiKeyboard'

const props = defineProps<{
    title: string
    modal?: boolean
    layout?: 'exchange' | 'quest' | 'shop'
    suspended?: boolean | undefined
}>()
const emit = defineEmits<{ close: [] }>()
defineSlots<{ default?: () => unknown; below?: () => unknown }>()
const panel = ref<HTMLElement>()
let suspendedFocus: HTMLElement | undefined
useEscapeOwner({
    active: () => !props.suspended,
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
    if (props.layout === 'shop' && navigateDialogueActions(event, panel.value)) return
    if (activateFocusedButton(event, panel.value) || navigatePanelFocus(event, panel.value)) return
    if (repeatConfirmation(event)) {
        event.preventDefault()
        return
    }
    if (event.code === 'Tab') trapTab(event)
}
function trapTab(event: KeyboardEvent): void {
    const fields = Array.from(
        panel.value?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'
        ) ?? []
    ).filter((field) => field.getAttribute('tabindex') !== '-1')
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
async function focusInitialAction(): Promise<void> {
    await nextTick()
    if (props.suspended) return
    const firstAction =
        props.layout === 'shop'
            ? panel.value?.querySelector<HTMLButtonElement>(
                  '[data-dialogue-action]:not(:disabled):not([tabindex="-1"])'
              )
            : undefined
    ;(firstAction ?? panel.value)?.focus()
}
onMounted(focusInitialAction)
watch(
    () => props.suspended,
    (suspended) => {
        const focused = document.activeElement
        if (suspended) {
            if (focused instanceof HTMLElement && panel.value?.contains(focused)) {
                suspendedFocus = focused
            }
            return
        }
        const restore = suspendedFocus
        suspendedFocus = undefined
        if (restore?.isConnected) {
            void nextTick(() => {
                if (!props.suspended) restore.focus()
            })
        } else void focusInitialAction()
    }
)
defineExpose({ focusInitialAction })
</script>
<template>
    <div
        v-show="!suspended"
        class="social-surface"
        :class="{
            'social-surface--modal': modal,
            'social-surface--exchange': layout === 'exchange',
            'social-surface--quest': layout === 'quest',
            'social-surface--shop': layout === 'shop',
        }"
        @pointerdown.self="modal && $event.preventDefault()"
    >
        <section
            ref="panel"
            class="social-window-stack"
            :class="{
                'social-window-stack--exchange': layout === 'exchange',
                'social-window-stack--shop': layout === 'shop',
                'quest-window': layout === 'quest',
            }"
            role="dialog"
            :aria-modal="modal || undefined"
            :aria-label="title"
            tabindex="-1"
            @keydown.stop="key"
            @keyup.stop
        >
            <slot v-if="layout" />
            <DarkWindowFrame v-else :title="title" @close="emit('close')">
                <slot />
            </DarkWindowFrame>
            <slot name="below" />
        </section>
    </div>
</template>

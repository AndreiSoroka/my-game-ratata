<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import { gameUiSoundKey } from './gameUiSound'
import { isConfirmationKey } from './keyboardOwnership'
import type { NearbyAction } from './nearbyActions'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'

const props = defineProps<{
    open: boolean
    actions: readonly NearbyAction[]
    contextLabel?: string
    targetKey?: string
    canSwitchCharacter?: boolean
}>()
const emit = defineEmits<{ select: [id: string]; close: []; switchCharacter: [reverse: boolean] }>()
const playUiSound = inject(gameUiSoundKey)
const menu = ref<HTMLElement>()
const panel = ref<HTMLElement>()
useEscapeOwner({ active: () => props.open, escape: () => emit('close'), element: panel })
const activeId = ref<string>()
const labelId = useId()
const enabled = computed(() => props.actions.filter((action) => !action.disabled))
let previousFocus: HTMLElement | undefined
let restoreOnClose = true

function returnFocus(): void {
    if (restoreOnClose) {
        const canvas = document.querySelector<HTMLElement>('[data-game-canvas]')
        ;(canvas ?? (previousFocus?.isConnected ? previousFocus : undefined))?.focus()
    }
    previousFocus = undefined
}
function focusAction(id?: string): void {
    activeId.value = id
    const button = Array.from(
        menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    ).find((item) => item.dataset.actionId === id)
    ;(button ?? menu.value)?.focus()
}
function navigateTo(id?: string): void {
    const previous = document.activeElement
    focusAction(id)
    if (id !== undefined && previous !== document.activeElement) playUiSound?.('uiSelect')
}
function activate(id?: string): void {
    if (id !== undefined && enabled.value.some((action) => action.id === id)) {
        emit('select', id)
    }
}
function moveFocus(direction: number): void {
    const index = enabled.value.findIndex((action) => action.id === activeId.value)
    const next = (index + direction + enabled.value.length) % enabled.value.length
    navigateTo(enabled.value[next]?.id)
}
function menuKey(event: KeyboardEvent): string {
    return (
        ({ KeyW: 'w', KeyS: 's' } as Record<string, string>)[event.code] ?? event.key.toLowerCase()
    )
}
function handleCharacterKey(event: KeyboardEvent): boolean {
    const horizontal = event.code || event.key
    if (!['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(horizontal)) return false
    if (
        props.canSwitchCharacter &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
    ) {
        event.preventDefault()
        emit('switchCharacter', horizontal === 'ArrowLeft' || horizontal === 'KeyA')
    }
    return true
}
function handleKey(event: KeyboardEvent): void {
    if (handleCharacterKey(event)) return
    const key = menuKey(event)
    if (key === 'tab') {
        restoreOnClose = false
        emit('close')
        return
    }
    if (key === 'escape') {
        event.preventDefault()
        emit('close')
    } else if (isConfirmationKey(event)) {
        event.preventDefault()
        if (!event.repeat) activate(activeId.value)
    } else if (['arrowdown', 's', 'arrowup', 'w'].includes(key)) {
        event.preventDefault()
        moveFocus(['arrowdown', 's'].includes(key) ? 1 : -1)
    } else if (key === 'home' || key === 'end') {
        event.preventDefault()
        navigateTo((key === 'home' ? enabled.value[0] : enabled.value.at(-1))?.id)
    }
}
watch(
    () => props.open,
    async (open) => {
        if (!open) {
            returnFocus()
            return
        }
        previousFocus =
            document.activeElement instanceof HTMLElement ? document.activeElement : undefined
        restoreOnClose = true
        await nextTick()
        if (props.open) {
            focusAction(enabled.value[0]?.id)
        }
    },
    { immediate: true }
)
watch(
    [() => props.actions, () => props.targetKey],
    async ([, key], [, previousKey]) => {
        if (!props.open) return
        await nextTick()
        if (!props.open || props.targetKey !== key) return
        const active = key === previousKey && enabled.value.some(({ id }) => id === activeId.value)
        focusAction(active ? activeId.value : enabled.value[0]?.id)
    },
    { deep: true }
)
onBeforeUnmount(returnFocus)
</script>

<template>
    <section
        v-if="open"
        ref="panel"
        class="nearby-action-panel adventure-window game-frame-host"
        :aria-labelledby="labelId"
        @keydown.stop="handleKey"
        @keyup.stop
        @pointerdown.stop
        @click.stop
    >
        <GameFrame variant="window" />
        <header class="nearby-action-panel__header">
            <h2 :id="labelId">{{ contextLabel ?? tGame('game.world.nearbyActions') }}</h2>
            <GameButton
                icon
                tabindex="-1"
                :aria-label="tGame('game.world.closeActions')"
                @click="emit('close')"
            >
                ×
            </GameButton>
        </header>
        <slot />
        <div ref="menu" role="menu" :aria-labelledby="labelId" tabindex="-1">
            <GameButton
                v-for="action in actions"
                :key="action.id"
                role="menuitem"
                :data-action-id="action.id"
                :tabindex="action.id === activeId && !action.disabled ? 0 : -1"
                :disabled="action.disabled"
                :aria-disabled="action.disabled || undefined"
                @focus="activeId = action.id"
                @click="activate(action.id)"
            >
                {{ action.label }}
            </GameButton>
            <p v-if="actions.length === 0" role="status">
                {{ tGame('game.world.noActionsAvailableNearby') }}
            </p>
        </div>
        <p class="nearby-action-panel__hint">
            <template v-if="canSwitchCharacter">
                {{ tGame('game.world.switchNearbyCharacter') }} ·
            </template>
            {{ tGame('game.world.wSSelectFEnter') }}
        </p>
    </section>
</template>

<style scoped>
.nearby-action-panel {
    position: absolute;
    z-index: 50;
    top: 50%;
    left: 50%;
    width: min(25rem, calc(100% - 2rem));
    max-height: 65dvh;
    overflow: auto;
    transform: translate(-50%, -50%);
    padding: 1rem;
    border: 2px solid transparent;
    pointer-events: auto;
}
.nearby-action-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
}
h2 {
    margin: 0;
    font-size: 1rem;
}
button {
    cursor: pointer;
}
[role='menu'] {
    display: grid;
    gap: 0.35rem;
}
[role='menuitem'] {
    padding: 0.7rem;
    border: 1px solid transparent;
    text-align: left;
}
[role='menuitem']:disabled {
    opacity: 0.5;
    cursor: default;
}
.nearby-action-panel__hint {
    margin: 0.8rem 0 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: #c0c7b6;
}
</style>

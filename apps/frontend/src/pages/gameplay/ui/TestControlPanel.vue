<script setup lang="ts">
import '../../../game/testing/testControlPanel.css'

import type { Vector2 } from '@my-game-ratata/contracts'
import { onBeforeUnmount, ref } from 'vue'

import { healthText } from '@/entities/player-vitals'
import { UiButton, UiFrame, UiInput } from '@/shared/ui/common'

import type { RatataTestApi, RatataTestState } from '../../../game/testing/testInterface'

const props = defineProps<{
    api: Pick<RatataTestApi, 'send' | 'stop' | 'inventory'>
    state: RatataTestState
}>()
const expanded = ref(window.innerWidth > 740)
const chat = ref('')
const targetX = ref(0)
const targetY = ref(0)
const directions = [
    { label: 'Up', symbol: '↑', axis: { x: 0, y: -1 } },
    { label: 'Left', symbol: '←', axis: { x: -1, y: 0 } },
    { label: 'Down', symbol: '↓', axis: { x: 0, y: 1 } },
    { label: 'Right', symbol: '→', axis: { x: 1, y: 0 } },
]

function startMoving(event: PointerEvent, axis: Vector2): void {
    if (!(event.currentTarget instanceof HTMLElement)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    props.api.send({ axis, type: 'move_input' })
}

function sendChat(): void {
    const text = chat.value.trim()
    if (text.length === 0) return
    props.api.send({ text, type: 'chat' })
    chat.value = ''
}

function moveTo(): void {
    props.api.send({ target: { x: targetX.value, y: targetY.value }, type: 'move_to' })
}

function togglePanel(): void {
    props.api.stop()
    expanded.value = !expanded.value
}

onBeforeUnmount(() => props.api.stop())
</script>

<template>
    <aside
        class="test-panel game-frame-host"
        :class="{ 'test-panel--collapsed': !expanded }"
        aria-label="Game test controls"
        @keydown.stop
        @keyup.stop
        @focusin="api.stop()"
    >
        <UiFrame variant="panel" />
        <UiButton
            size="compact"
            class="test-panel__toggle"
            :aria-expanded="expanded"
            @click="togglePanel"
        >
            <span>Test controls</span><span>{{ expanded ? '−' : '+' }}</span>
        </UiButton>
        <div v-if="expanded" class="test-panel__body">
            <dl class="test-panel__state">
                <dt>Connection</dt>
                <dd>{{ state.status }}</dd>
                <dt>Location</dt>
                <dd>{{ state.location?.name ?? '—' }}</dd>
                <dt>Position</dt>
                <dd>
                    {{
                        state.player
                            ? `${state.player.position.x.toFixed(1)}, ${state.player.position.y.toFixed(1)}`
                            : '—'
                    }}
                </dd>
                <dt>Health</dt>
                <dd>
                    {{ state.player ? healthText(state.player.health) || '—' : '—' }}
                </dd>
            </dl>
            <fieldset :disabled="!state.connected">
                <legend>Hold to move</legend>
                <div class="test-panel__directions">
                    <UiButton
                        size="compact"
                        v-for="direction in directions"
                        :key="direction.label"
                        :aria-label="`Move ${direction.label.toLowerCase()}`"
                        @pointerdown.prevent="startMoving($event, direction.axis)"
                        @pointerup="api.stop()"
                        @pointercancel="api.stop()"
                        @lostpointercapture="api.stop()"
                        @keydown.enter.prevent="
                            api.send({ axis: direction.axis, type: 'move_input' })
                        "
                        @keyup.enter="api.stop()"
                    >
                        {{ direction.symbol }}
                    </UiButton>
                    <UiButton size="compact" @click="api.stop()">Stop</UiButton>
                </div>
                <div class="test-panel__actions">
                    <UiButton size="compact" @click="api.send({ type: 'attack' })">
                        Attack / chest
                    </UiButton>
                    <UiButton size="compact" @click="api.send({ type: 'pickup_item' })">
                        Pick up
                    </UiButton>
                    <UiButton size="compact" @click="api.inventory()">Inventory</UiButton>
                </div>
                <form class="test-panel__form" @submit.prevent="moveTo">
                    <label
                        >X<UiInput
                            :border-width="4"
                            v-model.number="targetX"
                            type="number"
                            required
                            step="1"
                    /></label>
                    <label
                        >Y<UiInput
                            :border-width="4"
                            v-model.number="targetY"
                            type="number"
                            required
                            step="1"
                    /></label>
                    <UiButton variant="primary" size="compact" type="submit">Walk to</UiButton>
                </form>
                <form class="test-panel__chat" @submit.prevent="sendChat">
                    <UiInput
                        :border-width="4"
                        v-model="chat"
                        aria-label="Test chat message"
                        maxlength="100"
                        placeholder="Say something…"
                    />
                    <UiButton
                        variant="primary"
                        size="compact"
                        type="submit"
                        :disabled="chat.trim().length === 0"
                        >Send</UiButton
                    >
                </form>
            </fieldset>
            <p v-if="state.error" class="test-panel__error">{{ state.error }}</p>
            <p class="test-panel__hint">Commands use the same controls as the player.</p>
        </div>
    </aside>
</template>

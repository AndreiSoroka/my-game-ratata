<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import {
    isAudioMuted,
    isAudioMuteForced,
    setAudioMuted,
    subscribeAudioMute,
} from '../runtime/audioPreference'
import { dialogActionKeys } from './dialogActionKeys'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'

withDefaults(defineProps<{ automationAvailable?: boolean }>(), { automationAvailable: true })
const emit = defineEmits<{ resume: []; leave: []; character: []; markers: []; scenarios: [] }>()
const panel = ref<HTMLElement>()
const muted = ref(isAudioMuted())
const forcedMute = isAudioMuteForced()
const unsubscribeAudio = subscribeAudioMute((value) => {
    muted.value = value
})
onBeforeUnmount(unsubscribeAudio)
useEscapeOwner({ active: () => true, escape: () => emit('resume'), element: panel, priority: 200 })
onMounted(async () => {
    await nextTick()
    panel.value?.querySelector<HTMLButtonElement>('button')?.focus()
})
</script>

<template>
    <div class="game-menu-backdrop" @pointerdown.self.prevent.stop @click.self.stop>
        <section
            ref="panel"
            class="game-menu rpg-panel game-frame-host"
            role="dialog"
            aria-modal="true"
            aria-label="Игровое меню"
            tabindex="-1"
            @keydown.stop="dialogActionKeys($event, panel, () => emit('resume'))"
            @keyup.stop
        >
            <GameFrame variant="window" />
            <h2>Игровое меню</h2>
            <p>Мир продолжает жить, пока открыто меню.</p>
            <GameButton variant="primary" data-dialog-action="resume" @click="emit('resume')">
                Вернуться в игру
            </GameButton>
            <GameButton
                data-dialog-action="character"
                :disabled="!automationAvailable"
                @click="emit('character')"
            >
                Персонаж · P
            </GameButton>
            <GameButton
                data-dialog-action="markers"
                :disabled="!automationAvailable"
                @click="emit('markers')"
            >
                Метки
            </GameButton>
            <GameButton
                data-dialog-action="scenarios"
                :disabled="!automationAvailable"
                @click="emit('scenarios')"
            >
                Сценарии
            </GameButton>
            <GameButton
                data-dialog-action="sound"
                aria-label="Без звука"
                :aria-pressed="muted"
                :disabled="forcedMute"
                @click="setAudioMuted(!muted)"
            >
                Звук: {{ muted ? 'выключен' : 'включён' }}
            </GameButton>
            <p v-if="forcedMute">В этом режиме звук отключён.</p>
            <GameButton variant="danger" data-dialog-action="leave" @click="emit('leave')">
                Выйти из игры
            </GameButton>
        </section>
    </div>
</template>

<style scoped>
.game-menu-backdrop {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 16px;
    background: #0b151ab3;
}
.game-menu {
    display: grid;
    gap: 12px;
    width: min(340px, 100%);
    max-height: calc(100dvh - 32px);
    overflow: auto;
    padding: 20px;
    color: var(--rpg-text);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
h2,
p {
    margin: 0;
}
p {
    color: #c4cbbb;
}
button {
    min-height: 44px;
    padding: 10px 14px;
    border: 1px solid transparent;
    cursor: pointer;
}
</style>

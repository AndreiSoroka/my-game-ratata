<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, onMounted, ref, useId } from 'vue'

import { useEscapeOwner } from './uiEscapeOwners'
import { activateFocusedButton } from './uiKeyboard'

const props = withDefaults(
    defineProps<{
        character: CharacterSnapshot | undefined
        defeated: boolean
        pending?: boolean
        connected?: boolean
    }>(),
    { pending: false, connected: true }
)
const emit = defineEmits<{ newLife: []; abandonLife: []; openMenu: [] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({
    active: () => true,
    element: panel,
    priority: 175,
    escape: () => emit('openMenu'),
})
const headingId = useId()
const detailId = useId()
const seconds = computed(() =>
    Math.max(
        0,
        Math.ceil(
            (props.character?.life?.reviveMsLeft ?? props.character?.cooldowns.respawnMsLeft ?? 0) /
                1000
        )
    )
)
onMounted(() => panel.value?.focus())
function key(event: KeyboardEvent): void {
    if (event.code === 'Tab') {
        event.preventDefault()
        const button = panel.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ;(button ?? panel.value)?.focus()
        return
    }
    activateFocusedButton(event, panel.value)
}
</script>

<template>
    <section
        class="death-overlay"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="headingId"
        :aria-describedby="detailId"
        :aria-busy="pending"
        @keydown.stop="key"
        @keyup.stop
    >
        <div ref="panel" class="death-overlay__card" tabindex="-1">
            <p class="death-overlay__eyebrow">
                {{ defeated ? 'ИСТОРИЯ ЗАВЕРШЕНА' : 'МЕЖДУ ЖИЗНЬЮ И СМЕРТЬЮ' }}
            </p>
            <h2 :id="headingId">{{ defeated ? 'Ваш герой погиб' : 'Вы пали в бою' }}</h2>
            <template v-if="!defeated">
                <p class="death-overlay__countdown">{{ seconds }} <span>секунд</span></p>
                <p>Клирик ещё может вернуть вас к жизни. Позовите союзника и дождитесь помощи.</p>
                <p :id="detailId">
                    Если начать сначала, этого героя уже нельзя будет воскресить. Вещи и золото
                    останутся в его теле. Вы выберете нового героя без прежнего опыта и заданий.
                </p>
                <button
                    type="button"
                    :disabled="pending || !connected"
                    @click="$emit('abandonLife')"
                >
                    {{ pending ? 'Завершаем жизнь…' : 'Начать сначала' }}
                </button>
                <p v-if="!connected" role="status">Нет соединения с сервером.</p>
            </template>
            <template v-else>
                <p :id="detailId">
                    Следующая жизнь начнётся с новым героем — без прежних вещей, опыта и заданий.
                </p>
                <button type="button" @click="$emit('newLife')">Начать новую жизнь</button>
            </template>
        </div>
    </section>
</template>

<style scoped>
.death-overlay {
    position: absolute;
    inset: 0;
    z-index: 15;
    display: grid;
    place-items: center;
    background: #090b13bf;
    backdrop-filter: grayscale(0.7);
    padding: clamp(12px, 4vw, 24px);
    overflow: auto;
    box-sizing: border-box;
}
.death-overlay__card {
    width: min(440px, 100%);
    padding: clamp(18px, 5vw, 30px);
    color: #eee2ce;
    background: #181c22f5;
    border: 1px solid #998568;
    border-radius: 8px;
    text-align: center;
    box-sizing: border-box;
}
.death-overlay__eyebrow {
    color: #b5a48e;
    font:
        10px/1.4 system-ui,
        sans-serif;
    letter-spacing: 2px;
}
.death-overlay h2 {
    color: #e1bf8d;
    font-size: 25px;
    margin: 15px 0;
}
.death-overlay p {
    font:
        14px/1.6 system-ui,
        sans-serif;
}
.death-overlay .death-overlay__countdown {
    color: #f2d2a3;
    font-size: 44px;
    font-variant-numeric: tabular-nums;
    margin: 14px 0;
}
.death-overlay__countdown span {
    font-size: 13px;
    display: block;
}
.death-overlay button {
    margin-top: 18px;
    padding: 12px 18px;
    color: #201b10;
    background: #d3b779;
    border: 1px solid #f5dbaa;
    border-radius: 4px;
    font: inherit;
    cursor: pointer;
}
.death-overlay button:focus-visible {
    outline: 3px solid #fff0ba;
    outline-offset: 4px;
}
.death-overlay button:disabled {
    opacity: 0.65;
    cursor: wait;
}
.death-overlay__card:focus {
    outline: none;
}
</style>

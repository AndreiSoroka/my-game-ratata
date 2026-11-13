<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{ character: CharacterSnapshot | undefined; defeated: boolean }>()
defineEmits<{ newLife: [] }>()
const seconds = computed(() =>
    Math.max(0, Math.ceil((props.character?.cooldowns.respawnMsLeft ?? 0) / 1000))
)
</script>

<template>
    <section
        class="death-overlay"
        role="alert"
        aria-label="Состояние павшего героя"
        @keydown.stop
        @keyup.stop
    >
        <div class="death-overlay__card">
            <p class="death-overlay__eyebrow">
                {{ defeated ? 'ИСТОРИЯ ЗАВЕРШЕНА' : 'МЕЖДУ ЖИЗНЬЮ И СМЕРТЬЮ' }}
            </p>
            <h2>{{ defeated ? 'Ваш герой погиб' : 'Вы пали в бою' }}</h2>
            <template v-if="!defeated">
                <p class="death-overlay__countdown">{{ seconds }} <span>секунд</span></p>
                <p>Клирик ещё может вернуть вас к жизни. Позовите союзника и дождитесь помощи.</p>
            </template>
            <template v-else>
                <p>Следующая жизнь начнётся с новым героем — без прежних вещей, опыта и заданий.</p>
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
    padding: 24px;
}
.death-overlay__card {
    width: min(440px, 100%);
    padding: 30px;
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
</style>

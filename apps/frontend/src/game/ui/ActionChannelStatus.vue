<script setup lang="ts">
import { ABILITY_DEFINITIONS, type CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{ player: CharacterSnapshot; serverTime: number }>()
const emit = defineEmits<{ cancelPrayer: []; cancelRoute: [] }>()
const prayerName = computed(
    () =>
        ({
            ward: 'Сдерживание нежити',
            purify_grave: 'Очищение могилы',
            revive: 'Воскрешение',
            restore: ABILITY_DEFINITIONS[props.player.abilities?.casting?.abilityId ?? 'pray'].name,
            harm: 'Карающая молитва',
        })[props.player.abilities?.casting?.mode ?? 'revive']
)
const blockedRoute = computed(() => {
    const control = props.player.control
    return props.player.alive && control?.mode === 'route' && control.route?.waiting === 'blocked'
        ? control.route
        : undefined
})
const remainingSeconds = computed(() => {
    const remaining = blockedRoute.value?.remainingFailureMs
    return remaining === undefined ? undefined : Math.ceil(Math.max(0, remaining) / 1000)
})
</script>
<template>
    <p v-if="player.cooldowns.stunMsLeft > 0" class="control-status rpg-panel" role="status">
        СТАН · {{ (player.cooldowns.stunMsLeft / 1000).toFixed(1) }} с
    </p>
    <div v-else-if="player.abilities?.casting" class="control-status rpg-panel" role="status">
        {{ prayerName }} ·
        {{ (Math.max(0, player.abilities.casting.completesAt - serverTime) / 1000).toFixed(1) }} с
        <button
            v-if="!player.abilities.casting.uninterruptible"
            type="button"
            @keydown.esc.stop.prevent="emit('cancelPrayer')"
            @click="emit('cancelPrayer')"
        >
            Прервать · Esc
        </button>
    </div>
    <div
        v-else-if="blockedRoute?.points[0]"
        class="control-status control-status--route rpg-panel"
        role="status"
    >
        Точка {{ blockedRoute.points[0].number }}: путь перекрыт<template
            v-if="remainingSeconds !== undefined"
        >
            · отмена через {{ remainingSeconds }} с</template
        >
        · Esc — остановить
        <button type="button" @click="emit('cancelRoute')">Остановить маршрут</button>
    </div>
</template>
<style scoped>
.control-status {
    position: absolute;
    left: 50%;
    top: 42%;
    transform: translateX(-50%);
    padding: 10px;
    z-index: 9;
    color: var(--rpg-focus);
}
button {
    display: block;
    margin: 8px auto 0;
    padding: 6px 12px;
    border: 1px solid #bca575;
    background: #35433b;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
button:focus-visible {
    outline: 2px solid #f2cc78;
    outline-offset: 2px;
}
.control-status--route {
    width: max-content;
    max-width: calc(100% - 32px);
    box-sizing: border-box;
    text-align: center;
}
</style>

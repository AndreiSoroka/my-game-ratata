<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'

const props = defineProps<{ player: CharacterSnapshot }>()
const emit = defineEmits<{ cancelPrayer: []; cancelRoute: [] }>()
const stunned = computed(() => props.player.cooldowns.stunMsLeft > 0)
const casting = computed(() => props.player.abilities?.casting)
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
    <GameButton
        v-if="!stunned && casting && !casting.uninterruptible"
        class="prayer-cancel"
        icon
        aria-label="Прервать молитву"
        @keydown.esc.stop.prevent="emit('cancelPrayer')"
        @click="emit('cancelPrayer')"
    >
        ×
    </GameButton>
    <div
        v-else-if="!stunned && !casting && blockedRoute?.points[0]"
        class="control-status control-status--route rpg-panel game-frame-host"
        role="status"
    >
        <GameFrame variant="panel" />
        Точка {{ blockedRoute.points[0].number }}: путь перекрыт<template
            v-if="remainingSeconds !== undefined"
        >
            · отмена через {{ remainingSeconds }} с</template
        >
        · Esc — остановить
        <GameButton @click="emit('cancelRoute')">Остановить маршрут</GameButton>
    </div>
</template>
<style scoped>
.control-status,
.prayer-cancel {
    position: absolute;
    left: 50%;
    top: 42%;
    transform: translateX(-50%);
    z-index: 9;
}
.control-status {
    padding: 10px;
    color: var(--rpg-focus);
}
.control-status button {
    display: block;
    margin: 8px auto 0;
    padding: 6px 12px;
    border: 1px solid transparent;
    cursor: pointer;
}
.prayer-cancel {
    display: none;
}
@media (max-width: 640px), (pointer: coarse) {
    .prayer-cancel {
        display: inline-grid;
        min-width: 44px;
        min-height: 44px;
    }
}
.control-status--route {
    width: max-content;
    max-width: calc(100% - 32px);
    box-sizing: border-box;
    text-align: center;
}
</style>

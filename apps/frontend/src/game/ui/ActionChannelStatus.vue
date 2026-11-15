<script setup lang="ts">
import { ABILITY_DEFINITIONS, type CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{ player: CharacterSnapshot; serverTime: number }>()
const emit = defineEmits<{ cancelPrayer: [] }>()
const prayerName = computed(
    () =>
        ({
            purify_grave: 'Очищение могилы',
            revive: 'Воскрешение',
            restore: ABILITY_DEFINITIONS[props.player.abilities?.casting?.abilityId ?? 'pray'].name,
            harm: 'Карающая молитва',
        })[props.player.abilities?.casting?.mode ?? 'revive']
)
</script>
<template>
    <p v-if="player.cooldowns.stunMsLeft > 0" class="control-status rpg-panel" role="status">
        СТАН · {{ (player.cooldowns.stunMsLeft / 1000).toFixed(1) }} с
    </p>
    <div v-else-if="player.abilities?.casting" class="control-status rpg-panel" role="status">
        {{ prayerName }} ·
        {{ (Math.max(0, player.abilities.casting.completesAt - serverTime) / 1000).toFixed(1) }} с
        <button
            type="button"
            @keydown.esc.stop.prevent="emit('cancelPrayer')"
            @click="emit('cancelPrayer')"
        >
            Прервать · Esc
        </button>
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
</style>

<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{ character: CharacterSnapshot }>()
const patron = computed(() => props.character.progression?.deity)
const faith = computed(
    () => props.character.progression?.skills.find((skill) => skill.id === 'faith')?.level ?? 1
)
const moods = { benevolent: 'Благосклонен', neutral: 'Спокоен', wrathful: 'Разгневан' }
</script>
<template>
    <div
        v-if="character.abilities?.known.includes('pray') && patron"
        class="faith-status"
        aria-label="Вера и покровитель"
    >
        <span>✦ {{ patron.name }} · Вера {{ faith }}</span>
        <span v-if="patron.mood !== null">{{ moods[patron.mood] }}</span>
        <span v-else-if="patron.perception !== 'vague'" class="faith-status__omen">{{
            patron.omen
        }}</span>
    </div>
</template>
<style scoped>
.faith-status {
    display: grid;
    gap: 2px;
    border-top: 1px solid #a3916244;
    padding-top: 5px;
    color: #786039;
    font:
        11px/1.4 system-ui,
        sans-serif;
}
.faith-status__omen {
    font-size: 10px;
}
@media (max-width: 740px) {
    .faith-status {
        font-size: 9px;
    }
    .faith-status__omen {
        font-size: 8px;
    }
}
</style>

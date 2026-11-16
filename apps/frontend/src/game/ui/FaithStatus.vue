<script setup lang="ts">
import {
    type CharacterSnapshot,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{ character: CharacterSnapshot }>()
const patron = computed(() => props.character.progression?.deity)
const mastery = computed(() =>
    props.character.progression?.masteries.find(
        (entry) =>
            entry.id ===
            PRAYER_SCHOOL_DEFINITIONS[prayerAbilityForDeity(patron.value?.id ?? 'hearth')]
                .constellationId
    )
)
const moods = { benevolent: 'Благосклонен', neutral: 'Спокоен', wrathful: 'Разгневан' }
</script>
<template>
    <div
        v-if="patron && character.abilities?.known.includes(prayerAbilityForDeity(patron.id))"
        class="faith-status"
        aria-label="Покровитель и развитие"
    >
        <span>✦ {{ patron.name }} · {{ mastery?.name ?? 'Чудеса' }} {{ mastery?.level ?? 0 }}</span>
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

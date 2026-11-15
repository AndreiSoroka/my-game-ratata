<script setup lang="ts">
import {
    type CharacterSnapshot,
    type ClientMessage,
    type DeityId,
    prayerAbilityForDeity,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'
const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const known = computed(() =>
    prayerAbilityIds.filter((id) => props.player.abilities?.known.includes(id))
)
const patron = computed(() => {
    const deity = props.player.progression?.deity
    return deity && known.value.includes(prayerAbilityForDeity(deity.id)) ? deity : undefined
})
const shrine = computed(() =>
    props.characters.find(
        (character) =>
            character.id !== props.player.id &&
            character.alive &&
            character.faction === props.player.faction &&
            (character.heroClass === 'cleric' ||
                character.tags.some((tag) => tag === 'cleric' || tag === 'shrine')) &&
            Math.hypot(
                character.position.x - props.player.position.x,
                character.position.y - props.player.position.y
            ) <= 64
    )
)
const deities: { id: DeityId; label: string }[] = [
    { id: 'hearth', label: 'Очаг · исцеление' },
    { id: 'road', label: 'Дорога · энергия' },
    { id: 'lantern', label: 'Фонарь · мана' },
    { id: 'grave', label: 'Хранитель Праха · нежить' },
]
const chanceLabels: Record<DeityId, string> = {
    hearth: 'Шанс лечения',
    road: 'Шанс восстановления энергии',
    lantern: 'Шанс восстановления маны',
    grave: 'Шанс лечения нежити',
}
const moods = { benevolent: 'Благосклонен', neutral: 'Спокоен', wrathful: 'Разгневан' }
function choose(deityId: DeityId): void {
    if (shrine.value && known.value.includes(prayerAbilityForDeity(deityId)))
        emit('command', { type: 'choose_deity', deityId, targetId: shrine.value.id })
}
</script>
<template>
    <div v-if="patron" class="faith-knowledge">
        <p class="faith-patron">
            <strong>{{ patron.name }}</strong> · {{ patron.domain }}
        </p>
        <p class="faith-omen">{{ patron.omen }}</p>
        <div class="faith-secrets">
            <span v-if="patron.mood !== null">{{ moods[patron.mood] }}</span>
            <span v-if="patron.successChance !== null"
                >{{ chanceLabels[patron.id] }}: {{ Math.round(patron.successChance * 100) }}%</span
            >
            <span v-if="patron.changesInMs !== null"
                >Перемена через {{ Math.ceil(patron.changesInMs / 1000) }} сек.</span
            >
        </div>
        <section v-if="player.progression?.otherDeities?.length" aria-label="Знамения других богов">
            <h3>Другие боги</h3>
            <div
                v-for="deity in player.progression.otherDeities"
                :key="deity.id"
                class="faith-secrets"
            >
                <strong>{{ deity.name }}</strong
                ><span>{{ deity.omen }}</span>
                <span v-if="deity.mood !== null">{{ moods[deity.mood] }}</span>
                <span v-if="deity.successChance !== null"
                    >{{ chanceLabels[deity.id] }}:
                    {{ Math.round(deity.successChance * 100) }}%</span
                >
                <span v-if="deity.changesInMs !== null"
                    >Перемена через {{ Math.ceil(deity.changesInMs / 1000) }} сек.</span
                >
            </div>
        </section>
        <details class="faith-patrons">
            <summary>Сменить покровителя</summary>
            <div>
                <button
                    v-for="deity in deities.filter((deity) =>
                        known.includes(prayerAbilityForDeity(deity.id))
                    )"
                    :key="deity.id"
                    type="button"
                    :aria-pressed="patron.id === deity.id"
                    :disabled="!player.alive || !shrine || patron.id === deity.id"
                    @click="choose(deity.id)"
                >
                    {{ deity.label }}
                </button>
            </div>
            <small
                >{{
                    shrine ? `У обряда: ${shrine.nickname}` : 'Подойдите к клирику или святилищу.'
                }}
            </small>
        </details>
    </div>
</template>

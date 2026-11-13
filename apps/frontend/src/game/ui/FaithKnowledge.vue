<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, DeityId } from '@my-game-ratata/contracts'
import { computed } from 'vue'
const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const patron = computed(() => props.player.progression?.deity)
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
const needsGift = computed(() => {
    if (patron.value?.id === 'road')
        return props.player.resources.energy < props.player.resources.maxEnergy
    if (patron.value?.id === 'lantern')
        return props.player.resources.mana < props.player.resources.maxMana
    return props.player.hp < props.player.maxHp
})
const deities: { id: DeityId; label: string }[] = [
    { id: 'hearth', label: 'Очаг · исцеление' },
    { id: 'road', label: 'Дорога · энергия' },
    { id: 'lantern', label: 'Фонарь · мана' },
]
const moods = { benevolent: 'Благосклонен', neutral: 'Спокоен', wrathful: 'Разгневан' }
function choose(deityId: DeityId): void {
    if (shrine.value) emit('command', { type: 'choose_deity', deityId, targetId: shrine.value.id })
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
                >Шанс ответа: {{ Math.round(patron.successChance * 100) }}%</span
            >
            <span v-if="patron.changesInMs !== null"
                >Перемена через {{ Math.ceil(patron.changesInMs / 1000) }} сек.</span
            >
        </div>
        <div class="knowledge-action">
            <button
                type="button"
                :disabled="!player.alive || player.resources.mana < 5 || !needsGift"
                @click="emit('command', { type: 'pray' })"
            >
                Молиться · 5 MP
            </button>
            <small>{{
                needsGift
                    ? 'Раз в 3 сек. Ответ зависит от божества, веры и его настроения.'
                    : 'Силы полны. Дар нужен, когда не хватает здоровья, энергии или маны вашего покровителя.'
            }}</small>
        </div>
        <details class="faith-patrons">
            <summary>Сменить покровителя</summary>
            <div>
                <button
                    v-for="deity in deities"
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
                Воскрешение доступно только последователям Очага.</small
            >
        </details>
    </div>
</template>

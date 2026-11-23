<script setup lang="ts">
import {
    type CharacterSnapshot,
    type ClientMessage,
    type DeityId,
    prayerAbilityForDeity,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
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
    {
        id: 'hearth',
        get label() {
            return tGame('game.knowledge.hearthHealing')
        },
    },
    {
        id: 'road',
        get label() {
            return tGame('game.knowledge.roadEnergy')
        },
    },
    {
        id: 'lantern',
        get label() {
            return tGame('game.knowledge.lanternMana')
        },
    },
    {
        id: 'grave',
        get label() {
            return tGame('game.knowledge.ashGuardianUndead')
        },
    },
]
const chanceLabels: Record<DeityId, string> = {
    get hearth() {
        return tGame('game.knowledge.healingChance')
    },
    get road() {
        return tGame('game.knowledge.energyRecoveryChance')
    },
    get lantern() {
        return tGame('game.knowledge.manaRecoveryChance')
    },
    get grave() {
        return tGame('game.knowledge.undeadHealingChance')
    },
}
const moods = {
    get benevolent() {
        return tGame('game.knowledge.benevolent')
    },
    get neutral() {
        return tGame('game.knowledge.neutral')
    },
    get wrathful() {
        return tGame('game.knowledge.wrathful')
    },
}
function choose(deityId: DeityId): void {
    if (shrine.value && known.value.includes(prayerAbilityForDeity(deityId)))
        emit('command', { type: 'choose_deity', deityId, targetId: shrine.value.id })
}
</script>
<template>
    <div v-if="patron" class="faith-knowledge">
        <p class="faith-patron">
            <strong>{{ tGame(`game.deity.${patron.id}`) }}</strong> ·
            {{ tGame(`game.deityDomain.${patron.id}`) }}
        </p>
        <p class="faith-omen">{{ tLocalized(patron.omenMessage, patron.omen) }}</p>
        <div class="faith-secrets">
            <span v-if="patron.mood !== null">{{ moods[patron.mood] }}</span>
            <span v-if="patron.successChance !== null"
                >{{ chanceLabels[patron.id] }}: {{ Math.round(patron.successChance * 100) }}%</span
            >
            <span v-if="patron.changesInMs !== null"
                >{{ tGame('game.knowledge.changesIn') }} {{ Math.ceil(patron.changesInMs / 1000) }}
                {{ tGame('game.knowledge.sec') }}</span
            >
        </div>
        <section
            v-if="player.progression?.otherDeities?.length"
            :aria-label="tGame('game.knowledge.signsFromOtherGods')"
        >
            <h3>{{ tGame('game.knowledge.otherGods') }}</h3>
            <div
                v-for="deity in player.progression.otherDeities"
                :key="deity.id"
                class="faith-secrets"
            >
                <strong>{{ tGame(`game.deity.${deity.id}`) }}</strong
                ><span>{{ tLocalized(deity.omenMessage, deity.omen) }}</span>
                <span v-if="deity.mood !== null">{{ moods[deity.mood] }}</span>
                <span v-if="deity.successChance !== null"
                    >{{ chanceLabels[deity.id] }}:
                    {{ Math.round(deity.successChance * 100) }}%</span
                >
                <span v-if="deity.changesInMs !== null"
                    >{{ tGame('game.knowledge.changesIn') }}
                    {{ Math.ceil(deity.changesInMs / 1000) }}
                    {{ tGame('game.knowledge.sec') }}</span
                >
            </div>
        </section>
        <details class="faith-patrons">
            <summary>{{ tGame('game.knowledge.changePatron') }}</summary>
            <div>
                <GameButton
                    v-for="deity in deities.filter((deity) =>
                        known.includes(prayerAbilityForDeity(deity.id))
                    )"
                    :key="deity.id"
                    :aria-pressed="patron.id === deity.id"
                    :disabled="!player.alive || !shrine || patron.id === deity.id"
                    @click="choose(deity.id)"
                >
                    {{ deity.label }}
                </GameButton>
            </div>
            <small
                >{{
                    shrine
                        ? tGame('game.knowledge.atShrine', {
                              name: characterName(shrine.id, shrine.nickname),
                          })
                        : tGame('game.knowledge.approachShrine')
                }}
            </small>
        </details>
    </div>
</template>

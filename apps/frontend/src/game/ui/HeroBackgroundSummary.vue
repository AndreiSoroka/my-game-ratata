<script setup lang="ts">
import { HERO_BACKGROUND_DEFINITIONS, type HeroClass } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { backgroundName, masteryName, tGame } from '@/shared/lib/i18n'

import GameFrame from './primitives/GameFrame.vue'

const props = withDefaults(
    defineProps<{
        heroClass?: HeroClass | null
        showTitle?: boolean
    }>(),
    { showTitle: true }
)
const background = computed(() =>
    props.heroClass ? HERO_BACKGROUND_DEFINITIONS[props.heroClass] : undefined
)
const resourceBonuses = computed(() => {
    const bonus = background.value?.resourceBonus
    if (!bonus) return []
    return [
        bonus.health ? tGame('game.join.healthBonus', { amount: bonus.health }) : '',
        bonus.energy ? tGame('game.join.energyBonus', { amount: bonus.energy }) : '',
        bonus.mana ? tGame('game.join.manaBonus', { amount: bonus.mana }) : '',
    ].filter(Boolean)
})
const masteryBonus = computed(() => {
    if (!background.value) return ''
    return background.value.id === 'cleric'
        ? tGame('game.join.prayerBonus')
        : tGame('game.join.masteryBonus', { name: masteryName(background.value.masteryIds[0]!) })
})
</script>

<template>
    <section
        v-if="background"
        class="background-summary game-frame-host"
        :aria-label="tGame('game.join.backgroundBonuses')"
    >
        <GameFrame variant="inset" />
        <p v-if="showTitle" class="background-title">
            {{ tGame('game.join.backgroundName', { name: backgroundName(background.id) }) }}
        </p>
        <p>
            {{
                resourceBonuses.length
                    ? resourceBonuses.join(' · ')
                    : tGame('game.join.noResourceBonus')
            }}
        </p>
        <p>{{ masteryBonus }}</p>
    </section>
</template>

<style scoped>
.background-summary {
    margin: 0 0 16px;
    padding: 12px;
    border: 1px solid transparent;
    color: #dce4ca;
    font:
        12px/1.6 system-ui,
        sans-serif;
}
p {
    margin: 0;
}
.background-title {
    color: #f0d89c;
    font-size: 14px;
    margin-bottom: 4px;
}
</style>

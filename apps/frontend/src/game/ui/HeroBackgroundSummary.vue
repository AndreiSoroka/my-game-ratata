<script setup lang="ts">
import {
    backgroundResources,
    HERO_BACKGROUND_DEFINITIONS,
    type HeroClass,
    MASTERY_NAMES,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import GameFrame from './primitives/GameFrame.vue'

const props = withDefaults(
    defineProps<{
        heroClass?: HeroClass | null
        showTitle?: boolean
        showStartingResources?: boolean
    }>(),
    { showTitle: true, showStartingResources: false }
)
const background = computed(() =>
    props.heroClass ? HERO_BACKGROUND_DEFINITIONS[props.heroClass] : undefined
)
const resources = computed(() => backgroundResources(props.heroClass ?? undefined))
const resourceBonuses = computed(() => {
    const bonus = background.value?.resourceBonus
    if (!bonus) return []
    return [
        bonus.health ? `+${bonus.health} к здоровью` : '',
        bonus.energy ? `+${bonus.energy} к энергии` : '',
        bonus.mana ? `+${bonus.mana} к мане` : '',
    ].filter(Boolean)
})
const masteryBonus = computed(() => {
    if (!background.value) return ''
    return background.value.id === 'cleric'
        ? '+20% опыта всех молитвенных школ'
        : `+20% опыта созвездия «${MASTERY_NAMES[background.value.masteryIds[0]!]}»`
})
</script>

<template>
    <section
        v-if="background"
        class="background-summary game-frame-host"
        aria-label="Постоянные бонусы прошлого"
    >
        <GameFrame variant="inset" />
        <p v-if="showTitle" class="background-title">Прошлое: {{ background.name }}</p>
        <p>{{ resourceBonuses.length ? resourceBonuses.join(' · ') : 'Без прибавки ресурсов' }}</p>
        <p>{{ masteryBonus }}</p>
        <p v-if="showStartingResources" class="background-starting">
            Начальные запасы до звёзд: {{ resources.health }} HP · {{ resources.energy }} энергии ·
            {{ resources.mana }} маны.
        </p>
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
.background-starting {
    margin-top: 6px;
    color: #b7c7ad;
}
</style>

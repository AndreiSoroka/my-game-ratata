<script setup lang="ts">
import { type CharacterSnapshot, resolveCombatWeapon } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import {
    observedDamageText,
    observedResourceText,
    observedText,
} from './characterSheetPresentation'
import { healthBarPercent } from './healthPresentation'
import HeroBackgroundSummary from './HeroBackgroundSummary.vue'

const props = defineProps<{ player: CharacterSnapshot }>()
const sheet = computed(() => props.player.characterSheet)
const weapon = computed(() =>
    resolveCombatWeapon(props.player.archetype, props.player.equipment.weapon)
)
const resources = computed(() =>
    sheet.value
        ? [
              {
                  id: 'health',
                  name: 'Здоровье',
                  observation: sheet.value.health,
                  bar: props.player.health,
              },
              {
                  id: 'mana',
                  name: 'Мана',
                  observation: sheet.value.mana,
                  bar: props.player.resources.mana,
              },
              {
                  id: 'energy',
                  name: 'Энергия',
                  observation: sheet.value.energy,
                  bar: props.player.resources.energy,
              },
          ]
        : []
)
</script>

<template>
    <section class="character-stats" aria-label="Характеристики персонажа">
        <HeroBackgroundSummary :hero-class="player.heroClass" />
        <p
            v-if="weapon.kind === 'knife'"
            class="character-explanation"
            data-testid="backup-knife-description"
        >
            {{ weapon.description }}
        </p>
        <p class="character-explanation">
            Познавайте себя в приключениях: опыт уточняет оценки. Верхняя граница примерного
            диапазона не включается.
        </p>
        <template v-if="sheet">
            <div class="character-resources">
                <article
                    v-for="resource in resources"
                    :key="resource.id"
                    :data-resource="resource.id"
                >
                    <h3>{{ resource.name }}</h3>
                    <strong>{{ observedResourceText(resource.observation) }}</strong>
                    <progress
                        :value="healthBarPercent(resource.bar)"
                        max="100"
                        :aria-label="resource.name"
                    />
                    <small>Текущий запас / вместимость</small>
                </article>
            </div>
            <dl class="character-properties">
                <dt>Скорость движения</dt>
                <dd>{{ observedText(sheet.moveSpeed) }} клеток/с</dd>
                <dt>Уклонение</dt>
                <dd>{{ observedText(sheet.dodgeChance, 100) }}%</dd>
            </dl>
            <section class="character-attacks" aria-label="Атаки персонажа">
                <article v-for="attack in sheet.attacks" :key="attack.id" class="character-attack">
                    <h3>{{ attack.name }}</h3>
                    <dl class="character-properties">
                        <dt>Урон</dt>
                        <dd>{{ observedDamageText(attack.damage) }}</dd>
                        <dt>Интервал</dt>
                        <dd>{{ observedText(attack.cooldownMs, 0.001) }} с</dd>
                        <dt>Критический шанс</dt>
                        <dd>{{ observedText(attack.critChance, 100) }}%</dd>
                    </dl>
                </article>
            </section>
        </template>
        <p v-else role="status">Сведения о характеристиках ещё не получены.</p>
    </section>
</template>

<style scoped>
.character-explanation {
    margin: 0 0 18px;
    color: #aabdc1;
    font-size: 13px;
    line-height: 1.6;
}
.character-resources {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}
.character-resources article,
.character-attack {
    border: 1px solid #50616a;
    background: #12242bc9;
    padding: 16px;
}
h3 {
    margin: 0 0 10px;
    font-size: 15px;
    color: #f0d89c;
}
strong {
    font-size: 18px;
    font-weight: 500;
}
progress {
    display: block;
    width: 100%;
    height: 7px;
    margin: 12px 0 8px;
    accent-color: #c9ad6d;
}
small {
    color: #aabdc1;
    font-size: 11px;
}
.character-properties {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px 24px;
    margin: 20px 0;
}
dd {
    margin: 0;
    text-align: right;
    color: #f0d89c;
}
.character-attacks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.character-attack .character-properties {
    margin-bottom: 0;
}
@media (max-width: 600px) {
    .character-resources,
    .character-attacks {
        grid-template-columns: 1fr;
    }
    .character-resources article {
        padding: 12px;
    }
}
</style>

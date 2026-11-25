<script setup lang="ts">
import { type CharacterSnapshot, resolveCombatWeapon } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { HeroBackgroundSummary } from '@/entities/character-window'
import { abilityName, tGame, weaponName } from '@/shared/lib/i18n'
import { healthBarPercent } from '@/shared/lib/resource-display'
import { GameBar, UiFrame } from '@/shared/ui/common'
import { lightUiColors } from '@/shared/ui/theme'

import {
    observedDamageText,
    observedResourceText,
    observedText,
} from '../model/characterSheetPresentation'

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
                  tone: lightUiColors.bar.health,
                  name: tGame('game.character.health'),
                  observation: sheet.value.health,
                  bar: props.player.health,
              },
              {
                  id: 'mana',
                  tone: lightUiColors.bar.mana,
                  name: tGame('game.character.mana'),
                  observation: sheet.value.mana,
                  bar: props.player.resources.mana,
              },
              {
                  id: 'energy',
                  tone: lightUiColors.bar.energy,
                  name: tGame('game.character.energy'),
                  observation: sheet.value.energy,
                  bar: props.player.resources.energy,
              },
          ]
        : []
)
</script>

<template>
    <section class="character-stats" :aria-label="tGame('game.character.characterStats')">
        <HeroBackgroundSummary :hero-class="player.heroClass" />
        <p
            v-if="weapon.kind === 'knife'"
            class="character-explanation"
            data-testid="backup-knife-description"
        >
            {{ tGame('game.character.knifeDescription') }}
        </p>
        <p class="character-explanation">
            {{ tGame('game.character.learnAboutYourselfThroughAdventure') }}
        </p>
        <template v-if="sheet">
            <div class="character-resources">
                <article
                    v-for="resource in resources"
                    :key="resource.id"
                    :data-resource="resource.id"
                    class="character-resource game-frame-host"
                >
                    <UiFrame variant="inset" />
                    <h3>{{ resource.name }}</h3>
                    <strong>{{ observedResourceText(resource.observation) }}</strong>
                    <GameBar
                        class="character-resource__bar"
                        :value="healthBarPercent(resource.bar)"
                        :label="resource.name"
                        :color="resource.tone.color"
                        :track-color="resource.tone.trackColor"
                        :height="7"
                        :shadow="false"
                    />
                    <small>{{ tGame('game.character.currentAmountCapacity') }}</small>
                </article>
            </div>
            <dl class="character-properties">
                <dt>{{ tGame('game.character.movementSpeed') }}</dt>
                <dd>{{ observedText(sheet.moveSpeed) }} {{ tGame('game.character.tilesS') }}</dd>
                <dt>{{ tGame('game.character.dodge') }}</dt>
                <dd>{{ observedText(sheet.dodgeChance, 100) }}%</dd>
            </dl>
            <section
                class="character-attacks"
                :aria-label="tGame('game.character.characterAttacks')"
            >
                <article
                    v-for="attack in sheet.attacks"
                    :key="attack.id"
                    class="character-attack game-frame-host"
                >
                    <UiFrame variant="inset" />
                    <h3>
                        {{
                            attack.id === 'basic_attack'
                                ? weaponName(weapon.kind)
                                : abilityName(attack.id, attack.name)
                        }}
                    </h3>
                    <dl class="character-properties">
                        <dt>{{ tGame('game.character.damage') }}</dt>
                        <dd>{{ observedDamageText(attack.damage) }}</dd>
                        <dt>{{ tGame('game.character.interval') }}</dt>
                        <dd>
                            {{ observedText(attack.cooldownMs, 0.001) }}
                            {{ tGame('game.knowledge.s') }}
                        </dd>
                        <dt>{{ tGame('game.character.criticalChance') }}</dt>
                        <dd>{{ observedText(attack.critChance, 100) }}%</dd>
                    </dl>
                </article>
            </section>
        </template>
        <p v-else role="status">{{ tGame('game.character.characterStatsAreNotAvailable') }}</p>
    </section>
</template>

<style scoped>
.character-explanation {
    margin: 0 0 18px;
    color: var(--ui-dark-panel-text);
    font-size: 13px;
    line-height: 1.6;
}
.character-resources {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}
.character-resource,
.character-attack {
    border: 1px solid transparent;
    padding: 16px;
}
h3 {
    margin: 0 0 10px;
    font-size: 15px;
    color: var(--ui-dark-panel-title);
}
strong {
    font-size: 18px;
    font-weight: 500;
}
.character-resource__bar {
    margin: 12px 0 8px;
}
small {
    color: var(--ui-dark-panel-text);
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
    color: var(--ui-dark-panel-title);
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

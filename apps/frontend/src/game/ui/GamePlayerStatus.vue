<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import {
    CharacterHudFrame,
    healthBarPercent,
    type PlayerStatusData,
    projectPlayerEffects,
    projectPlayerStatusDetails,
} from '@/entities/character'
import { PlayerEffectsWidget } from '@/widgets/player-effects'
import { PlayerStatusWidget } from '@/widgets/player-status'

import { useStatusPanelBounds } from './useStatusPanelBounds'

const props = defineProps<{ character: CharacterSnapshot; serverTime?: number }>()
const panel = ref<HTMLElement>()
useStatusPanelBounds(panel)

const status = computed<PlayerStatusData>(() => {
    const {
        health: hp,
        resources: { mana, energy },
    } = props.character
    return {
        ...projectPlayerStatusDetails(props.character),
        hpPercent: healthBarPercent(hp),
        manaPercent: healthBarPercent(mana),
        energyPercent: healthBarPercent(energy),
        ...(hp.kind === 'exact' && { hpCurrent: hp.current, hpMax: hp.max }),
        ...(mana.kind === 'exact' && { manaCurrent: mana.current, manaMax: mana.max }),
        ...(energy.kind === 'exact' && { energyCurrent: energy.current, energyMax: energy.max }),
    }
})
const effects = computed(() => projectPlayerEffects(props.character, props.serverTime))
</script>

<template>
    <div ref="panel" class="game-player-status">
        <CharacterHudFrame compact>
            <PlayerStatusWidget v-bind="status" compact />
            <PlayerEffectsWidget
                :effects="effects"
                :soul-kind="character.soul?.kind"
                :is-can-speak="character.soul?.canSpeak"
                compact
            />
        </CharacterHudFrame>
    </div>
</template>

<style scoped>
.game-player-status {
    --game-player-status-top: var(--game-hud-top, 14px);
    position: absolute;
    top: var(--game-player-status-top);
    right: 14px;
    z-index: 3;
    display: flex;
    flex-direction: column;
    width: min(220px, calc(100% - 28px));
    max-height: max(0px, calc(100% - var(--game-player-status-top) - 112px));
}

@media (max-width: 740px) {
    .game-player-status {
        right: 12px;
        width: 150px;
    }
}
</style>

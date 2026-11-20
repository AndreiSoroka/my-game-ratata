<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import {
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
        <PlayerStatusWidget class="game-player-status__resources" v-bind="status" />
        <PlayerEffectsWidget
            :effects="effects"
            :soul-kind="character.soul?.kind"
            :is-can-speak="character.soul?.canSpeak"
        />
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
    gap: 8px;
    width: min(300px, calc(100% - 28px));
    max-height: max(0px, calc(100% - var(--game-player-status-top) - 112px));
}

.game-player-status__resources {
    flex: none;
}

@media (max-width: 740px) {
    .game-player-status {
        right: 12px;
        width: 150px;
    }
}
</style>

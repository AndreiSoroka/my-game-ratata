<script setup lang="ts">
import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { FaithStatusList, projectPlayerPatrons, SoulBadgeIcons } from '@/entities/player-effects'
import { healthBarPercent, type PlayerVitalsData } from '@/entities/player-vitals'
import { HudFrame } from '@/shared/ui/common'
import { PlayerEffectsStripWidget } from '@/widgets/player-effects'
import { PlayerVitalsWidget } from '@/widgets/player-vitals'

import { useStatusPanelBounds } from '../model/useStatusPanelBounds'

const props = defineProps<{ character: CharacterSnapshot; serverTime?: number }>()
const panel = ref<HTMLElement>()
useStatusPanelBounds(panel)

const vitals = computed<PlayerVitalsData>(() => {
    const {
        nickname,
        health: hp,
        resources: { mana, energy },
    } = props.character
    return {
        nickname,
        hpPercent: healthBarPercent(hp),
        manaPercent: healthBarPercent(mana),
        energyPercent: healthBarPercent(energy),
        ...(mana.kind === 'percent' && mana.segments && { manaSegments: mana.segments }),
        ...(hp.kind === 'percent' && hp.segments && { hpSegments: hp.segments }),
        ...(energy.kind === 'percent' && energy.segments && { energySegments: energy.segments }),
        ...(hp.kind === 'exact' && { hpCurrent: hp.current, hpMax: hp.max }),
        ...(mana.kind === 'exact' && { manaCurrent: mana.current, manaMax: mana.max }),
        ...(energy.kind === 'exact' && { energyCurrent: energy.current, energyMax: energy.max }),
    }
})
const patrons = computed(() => projectPlayerPatrons(props.character))
</script>

<template>
    <div ref="panel" class="game-player-status">
        <HudFrame class="game-player-status__vitals">
            <PlayerVitalsWidget v-bind="vitals" compact />
            <FaithStatusList :patrons="patrons" />
            <SoulBadgeIcons
                class="game-player-status__identity"
                :soul-kind="character.soul?.kind"
                :is-can-speak="character.soul?.canSpeak"
            />
        </HudFrame>
        <PlayerEffectsStripWidget
            class="game-player-status__effects"
            :character="character"
            :server-time="serverTime"
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
    flex-direction: row-reverse;
    align-items: flex-start;
    gap: 8px;
    width: max-content;
    max-width: calc(100% - 28px);
    max-height: max(0px, calc(100% - var(--game-player-status-top) - 112px));
    pointer-events: none;
}

.game-player-status__vitals {
    flex: none;
    width: 220px;
    max-width: 100%;
    pointer-events: auto;
}

.game-player-status__identity {
    --soul-badge-icon-size: 12px;
    --soul-badge-icon-font: var(--ratata-font-family, sans-serif);
    flex: none;
    min-height: 16px;
    gap: 4px;
    margin-block-start: 5px;
    border-block-start: 1px solid var(--ui-dark-panel-divider);
    color: var(--ui-dark-panel-title);
}

.game-player-status__effects {
    width: 224px;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
}

@media (max-width: 740px) {
    .game-player-status {
        right: 12px;
        flex-direction: column;
        align-items: flex-end;
        max-width: calc(100% - 24px);
    }

    .game-player-status__vitals {
        width: 150px;
    }

    .game-player-status__effects {
        overflow-y: auto;
        overscroll-behavior: contain;
    }
}

@container (max-width: 180px) {
    .game-player-status__identity {
        --soul-badge-icon-size: 10px;
    }
}
</style>

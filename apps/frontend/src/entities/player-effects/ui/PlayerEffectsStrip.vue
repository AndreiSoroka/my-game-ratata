<script setup lang="ts">
import { computed, useId } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton, type UiButtonColors } from '@/shared/ui/common'

import type { PlayerEffect } from '../model/playerEffects'
import { createPlayerEffectSelection } from '../model/playerEffectsSelection'
import PlayerEffectDetails from './PlayerEffectDetails.vue'
import { presentPlayerEffects } from './playerEffectPresentation'

const props = defineProps<{ effects: readonly PlayerEffect[] }>()
const activeEffects = computed(() => presentPlayerEffects(props.effects))
const detailId = useId()
const { selectedKind, selectedEffect, toggleEffect } = createPlayerEffectSelection(
    () => activeEffects.value
)

const tileColors: UiButtonColors = {
    normal: {
        text: 'var(--player-effect-accent)',
        border: 'var(--player-effect-border)',
        backgroundTop: 'var(--player-effect-surface-top)',
        backgroundBottom: 'var(--player-effect-surface)',
    },
    highlighted: {
        text: 'var(--player-effect-accent)',
        border: 'var(--player-effect-accent)',
        backgroundTop: 'var(--ui-dark-bar-track)',
    },
    edge: 'var(--ui-dark-panel-divider)',
    focus: 'var(--ui-dark-panel-title)',
}
</script>

<template>
    <div v-if="activeEffects.length" class="player-effects-strip">
        <ul
            class="player-effects-strip__tiles"
            :aria-label="tGame('game.world.playerEffects')"
            role="list"
        >
            <li v-for="effect in activeEffects" :key="effect.kind">
                <UiButton
                    class="player-effects-strip__tile"
                    border="border-008"
                    :colors="tileColors"
                    :data-player-effect="effect.kind"
                    :data-tone="effect.tone"
                    :aria-label="effect.text"
                    :aria-expanded="selectedKind === effect.kind"
                    :aria-controls="selectedKind === effect.kind ? detailId : undefined"
                    :title="effect.text"
                    @click="toggleEffect(effect.kind)"
                >
                    <span class="player-effects-strip__glyph" aria-hidden="true">
                        <svg viewBox="0 0 12 12" shape-rendering="crispEdges" focusable="false">
                            <path :d="effect.path" fill="currentColor" fill-rule="evenodd" />
                        </svg>
                        <span v-if="effect.timer" class="player-effects-strip__timer">{{
                            effect.timer
                        }}</span>
                    </span>
                    <span
                        v-if="effect.stacks"
                        class="player-effects-strip__stacks"
                        aria-hidden="true"
                        >{{ effect.stacks }}</span
                    >
                </UiButton>
            </li>
        </ul>
        <PlayerEffectDetails v-if="selectedEffect" :id="detailId" :effect="selectedEffect" />
    </div>
</template>

<style scoped>
.player-effects-strip {
    display: grid;
    justify-items: end;
    gap: 4px;
    min-inline-size: 0;
    max-inline-size: 100%;
}

.player-effects-strip__tiles {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    min-inline-size: 0;
    max-inline-size: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
}

.player-effects-strip__tile {
    --player-effect-surface: var(--character-hud-surface, var(--ui-dark-panel-surface));
    --player-effect-surface-top: color-mix(
        in srgb,
        var(--player-effect-surface) 68%,
        var(--ui-dark-bar-track)
    );
    --player-effect-accent: var(--ui-dark-panel-title);
    --player-effect-border: color-mix(
        in srgb,
        var(--character-hud-border, var(--ui-dark-panel-border)) 72%,
        var(--player-effect-accent)
    );
    inline-size: 36px;
    block-size: 36px;
    min-inline-size: 0;
    min-block-size: 0;
    padding: 0;
    pointer-events: auto;
}

.player-effects-strip__tile[data-tone='positive'] {
    --player-effect-accent: var(--ui-dark-panel-positive);
}

.player-effects-strip__tile[data-tone='warning'] {
    --player-effect-accent: var(--ui-dark-panel-warning);
}

.player-effects-strip__tile[aria-expanded='true'] {
    --player-effect-border: var(--player-effect-accent);
}

.player-effects-strip__glyph {
    display: grid;
    justify-items: center;
    gap: 1px;
}

.player-effects-strip__glyph > svg {
    width: 15px;
    height: 15px;
}

.player-effects-strip__timer,
.player-effects-strip__stacks {
    display: block;
    overflow: hidden;
    font-size: 10px;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.player-effects-strip__timer {
    max-inline-size: 30px;
}

.player-effects-strip__stacks {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-end: 2px;
    max-inline-size: 20px;
    background: var(--player-effect-surface);
}
</style>

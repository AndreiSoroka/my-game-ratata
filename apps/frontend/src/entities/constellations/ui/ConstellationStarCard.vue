<script setup lang="ts">
import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'

import { tGame, tLocalized } from '@/shared/lib/i18n'
import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

defineProps<{ node: ConstellationNodeSnapshot }>()
const theme = useDarkPanelTheme()
</script>

<template>
    <aside
        class="constellation-detail"
        :style="darkPanelThemeStyle(theme)"
        :aria-label="tGame('game.knowledge.selectedStar')"
        aria-live="polite"
    >
        <FantasyBorder
            as="span"
            class="constellation-detail__border"
            :border="theme?.border ?? 'border-017'"
            :color="theme?.accent ?? 'var(--ui-dark-panel-border)'"
            aria-hidden="true"
        />
        <template v-if="node.unlocked && node.name">
            <h3>{{ tLocalized(node.nameMessage, node.name) }}</h3>
            <span v-if="node.effectType" class="constellation-detail__type">{{
                node.effectType === 'active'
                    ? tGame('game.knowledge.activeSpell')
                    : tGame('game.knowledge.passiveSkill')
            }}</span>
            <p v-if="node.description">
                {{ tLocalized(node.descriptionMessage, node.description) }}
            </p>
            <ul v-if="node.effects?.length">
                <li v-for="(effect, index) in node.effects" :key="effect">
                    {{ tLocalized(node.effectMessages?.[index] ?? undefined, effect) }}
                </li>
            </ul>
        </template>
        <h3 v-else>{{ tGame('game.knowledge.unknown') }}</h3>
    </aside>
</template>

<style scoped>
.constellation-detail {
    --constellation-detail-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    position: relative;
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 18px;
    border: 1px solid transparent;
    background: linear-gradient(
        135deg,
        color-mix(
            in srgb,
            var(--constellation-detail-surface) 92%,
            var(--ui-themed-panel-accent, var(--ui-dark-panel-border))
        ),
        var(--constellation-detail-surface) 72%
    );
    color: var(--ui-dark-panel-text);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
.constellation-detail__border {
    position: absolute;
    inset: 0;
    pointer-events: none;
}
h3,
p,
ul {
    margin: 0;
}
h3 {
    font-size: 20px;
    color: var(--ui-dark-panel-title);
}
.constellation-detail__type {
    color: var(--ui-dark-panel-positive);
    font-size: 11px;
}
p,
li {
    font-size: 12px;
    line-height: 1.65;
}
ul {
    display: grid;
    gap: 4px;
    padding-left: 18px;
}
@media (max-width: 780px) {
    .constellation-detail {
        padding: 14px;
    }
}
</style>

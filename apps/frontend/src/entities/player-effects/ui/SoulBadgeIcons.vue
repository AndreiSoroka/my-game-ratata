<script setup lang="ts">
import type { SoulKind } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import SoulSpeechIcon from './SoulSpeechIcon.vue'

defineProps<{ soulKind?: SoulKind | undefined; isCanSpeak?: boolean | undefined }>()
</script>

<template>
    <span v-if="soulKind" class="soul-badge-icons">
        <span
            class="soul-badge-icons__icon"
            role="img"
            :aria-label="
                soulKind === 'spark' ? tGame('game.knowledge.spark') : tGame('game.knowledge.echo')
            "
            :title="
                soulKind === 'spark' ? tGame('game.knowledge.spark') : tGame('game.knowledge.echo')
            "
            >{{ soulKind === 'spark' ? '✧' : '◌' }}</span
        >
        <span
            class="soul-badge-icons__icon"
            role="img"
            :aria-label="
                isCanSpeak ? tGame('game.knowledge.canSpeak') : tGame('game.knowledge.cannotSpeak')
            "
            :title="
                isCanSpeak ? tGame('game.knowledge.canSpeak') : tGame('game.knowledge.cannotSpeak')
            "
        >
            <SoulSpeechIcon :is-can-speak="isCanSpeak" />
        </span>
    </span>
</template>

<style scoped>
.soul-badge-icons {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #a8b4a5;
}

.soul-badge-icons__icon {
    display: inline-grid;
    width: 1em;
    height: 1em;
    place-items: center;
    font: var(--soul-badge-icon-size, 16px) / 1 var(--soul-badge-icon-font, system-ui, sans-serif);
}
</style>

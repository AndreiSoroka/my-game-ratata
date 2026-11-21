<script setup lang="ts">
import type { SoulKind } from '@my-game-ratata/contracts'

import {
    type PlayerEffectsData,
    PlayerEffectsView,
    SoulBadgeIcons,
} from '@/entities/player-effects'

interface PlayerEffectsWidgetProps extends PlayerEffectsData {
    soulKind?: SoulKind | undefined
    isCanSpeak?: boolean | undefined
}

defineProps<PlayerEffectsWidgetProps>()
</script>

<template>
    <PlayerEffectsView :effects="effects" :compact="compact">
        <template #identity="{ class: identityClass }">
            <SoulBadgeIcons
                :class="identityClass"
                :soul-kind="soulKind"
                :is-can-speak="isCanSpeak"
            />
        </template>
    </PlayerEffectsView>
</template>

<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { HeroBackgroundSummary } from '@/entities/character-window'
import { KnowledgeWindow } from '@/entities/progression'
import { tGame } from '@/shared/lib/i18n'
import { ConstellationAtlasWidget } from '@/widgets/constellation-atlas'

const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const selectedId = ref('')
const sky = computed(() => props.player.progression?.constellations)
const selected = computed(
    () =>
        sky.value?.nodes.find((node) => node.id === selectedId.value) ??
        sky.value?.nodes.find((node) => node.id === sky.value?.layout?.centerNodeId) ??
        sky.value?.nodes.find((node) => node.kind === 'root' && node.unlocked) ??
        sky.value?.nodes[0]
)
watch(
    () => props.player.id,
    () => {
        selectedId.value = ''
    }
)
</script>

<template>
    <section
        class="character-development"
        :aria-label="tGame('game.character.characterProgression')"
    >
        <HeroBackgroundSummary :hero-class="player.heroClass" />
        <template v-if="sky">
            <ConstellationAtlasWidget
                :key="player.id"
                class="development-layout"
                :constellation="sky"
                :selected-star="selected"
                @select="selectedId = $event"
            />
            <KnowledgeWindow
                v-if="selected?.unlocked && selected.parents.length === 0"
                :key="selected.constellationId"
                embedded
                :constellation-id="selected.constellationId"
                :player="player"
                :characters="characters"
                @learn-ability="emit('command', { type: 'learn_ability', ...$event })"
                @learn-spell="
                    emit('command', { type: 'learn_skill', skillId: 'fireball', targetId: $event })
                "
                @cast-spell="emit('command', { type: 'cast_spell', ...$event })"
                @choose-deity="emit('command', { type: 'choose_deity', ...$event })"
                @study="emit('command', { type: 'study_magic', targetId: $event })"
                @teach="emit('command', { type: 'teach_magic', targetId: $event })"
            />
        </template>
        <p v-else>{{ tGame('game.character.yourSkyIsNotAvailable') }}</p>
    </section>
</template>

<style scoped>
.development-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 16px;
    align-items: start;
}
@media (max-width: 780px) {
    .development-layout {
        grid-template-columns: 1fr;
    }
}
</style>

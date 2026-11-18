<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import ConstellationGraph from './ConstellationGraph.vue'
import ConstellationStarCard from './ConstellationStarCard.vue'
import HeroBackgroundSummary from './HeroBackgroundSummary.vue'
import KnowledgeWindow from './KnowledgeWindow.vue'

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
    <section class="character-development" aria-label="Развитие персонажа">
        <HeroBackgroundSummary :hero-class="player.heroClass" />
        <template v-if="sky">
            <div class="development-layout">
                <ConstellationGraph
                    :key="player.id"
                    :constellation="sky"
                    :selected-id="selected?.id"
                    @select="selectedId = $event"
                />
                <ConstellationStarCard v-if="selected" :node="selected" />
            </div>
            <KnowledgeWindow
                v-if="selected?.unlocked && selected.parents.length === 0"
                :key="selected.constellationId"
                embedded
                :constellation-id="selected.constellationId"
                :player="player"
                :characters="characters"
                @command="emit('command', $event)"
            />
        </template>
        <p v-else>Небосвод ещё не получен.</p>
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

<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import ConstellationGraph from './ConstellationGraph.vue'
import KnowledgeWindow from './KnowledgeWindow.vue'

const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const selectedId = ref('')
const sky = computed(() => props.player.progression?.constellations)
const selected = computed(
    () =>
        sky.value?.nodes.find((node) => node.id === selectedId.value) ??
        sky.value?.nodes.find((node) => node.kind === 'root' && node.unlocked) ??
        sky.value?.nodes[0]
)
const path = computed(() =>
    sky.value?.paths.find((path) => path.id === selected.value?.constellationId)
)
const parents = computed(() =>
    selected.value?.parents
        .map((id) => sky.value?.nodes.find((node) => node.id === id)?.name ?? 'Неизвестная звезда')
        .join(', ')
)
</script>

<template>
    <section class="character-development" aria-label="Развитие персонажа">
        <p class="development-intro">
            Практика за настоящие действия открывает новые звёзды. Предыстория задаёт начало пути;
            остальные созвездия доступны каждому.
        </p>
        <template v-if="sky">
            <div class="development-layout">
                <ConstellationGraph
                    :constellation="sky"
                    :selected-id="selected?.id"
                    @select="selectedId = $event"
                />
                <aside
                    v-if="selected"
                    class="constellation-detail"
                    aria-label="Выбранная звезда"
                    aria-live="polite"
                >
                    <span class="constellation-detail__path" :style="{ color: path?.color }">{{
                        path?.name
                    }}</span>
                    <h3>{{ selected.name ?? 'Неизвестная звезда' }}</h3>
                    <span class="constellation-detail__state">{{
                        selected.unlocked
                            ? '✦ Открыто'
                            : selected.kind === 'root'
                              ? '◇ Путь не открыт'
                              : '◇ Скрытая возможность'
                    }}</span>
                    <p>
                        {{
                            selected.description ??
                            'Продолжайте практиковаться в этом созвездии. Эффект звезды станет известен после её открытия.'
                        }}
                    </p>
                    <p v-if="parents" class="constellation-detail__parents">
                        Предшественники: {{ parents }}
                    </p>
                    <p
                        v-if="
                            selected.kind === 'root' && path?.description !== selected.description
                        "
                        class="constellation-detail__parents"
                    >
                        {{ path?.description }}
                    </p>
                    <p class="constellation-detail__hint">
                        Новые возможности открываются через применение навыков. Тратить очки здесь
                        не требуется.
                    </p>
                </aside>
            </div>
            <KnowledgeWindow
                v-if="selected?.kind === 'root'"
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
.development-intro {
    margin: 0 0 16px;
    color: #aabdc1;
    font-size: 12px;
}
.development-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 16px;
    align-items: start;
}
.constellation-detail {
    min-width: 0;
    padding: 18px;
    border: 1px solid #4f6470;
    background: #122631;
}
.constellation-detail__path {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
}
h3 {
    margin: 9px 0;
    font-size: 20px;
    color: #f0d89c;
}
.constellation-detail__state {
    color: #b6d7be;
    font-size: 11px;
}
.constellation-detail p {
    font-size: 12px;
    line-height: 1.6;
}
.constellation-detail__parents,
.constellation-detail__hint {
    color: #95abb5;
}
.constellation-detail__hint {
    margin-top: 22px;
    padding-top: 12px;
    border-top: 1px solid #36515e;
}
@media (max-width: 780px) {
    .development-layout {
        grid-template-columns: 1fr;
    }
    .constellation-detail {
        padding: 14px;
    }
}
</style>

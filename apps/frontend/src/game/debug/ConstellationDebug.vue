<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { ref, watch } from 'vue'

import ConstellationGraph from '../ui/ConstellationGraph.vue'
import ConstellationStarCard from '../ui/ConstellationStarCard.vue'
import { debugHeroClasses } from './constellationDebugSettings'
import ConstellationDebugUnlock from './ConstellationDebugUnlock.vue'
import { useConstellationDebug } from './useConstellationDebug'

const props = withDefaults(
    defineProps<{
        syncUrl?: boolean
        initialHeroClass?: HeroClass
        initialSeed?: string
    }>(),
    { syncUrl: true }
)
const {
    settings,
    draftSeed,
    query,
    path,
    generation,
    sky,
    selectedId,
    selected,
    pathNames,
    filtered,
    applySeed,
    changeClass,
    newMap,
} = useConstellationDebug(props)
const graph = ref<InstanceType<typeof ConstellationGraph>>()
const list = ref<HTMLUListElement>()
const detailsPanel = ref<HTMLElement>()
function selectNode(id: string): void {
    selectedId.value = id
    if (detailsPanel.value) detailsPanel.value.scrollTop = 0
}
watch(selected, () => {
    if (detailsPanel.value) detailsPanel.value.scrollTop = 0
})
function selectStar(id: string): void {
    graph.value?.focusNode(id)
}
function listKey(event: KeyboardEvent): void {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.code)) return
    const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    if (!buttons.length) return
    const current = buttons.findIndex((button) => button === document.activeElement)
    const next =
        event.code === 'Home'
            ? 0
            : event.code === 'End'
              ? buttons.length - 1
              : (current + (event.code === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
    event.preventDefault()
    buttons[next]?.focus()
}
</script>
<template>
    <main class="constellation-debug" data-testid="constellation-debug">
        <header class="debug-header">
            <div class="debug-header-line">
                <h1>Атлас созвездий · Отладка</h1>
                <a href="/">В игру</a>
            </div>
            <p>Все 77 звёзд. Просмотр не меняет развитие героя.</p>
        </header>
        <form class="debug-settings" @submit.prevent="applySeed">
            <label
                >Начальный класс
                <select
                    data-testid="debug-class"
                    :value="settings.heroClass"
                    @change="changeClass(($event.target as HTMLSelectElement).value as HeroClass)"
                >
                    <option v-for="hero in debugHeroClasses" :key="hero.id" :value="hero.id">
                        {{ hero.name }}
                    </option>
                </select>
            </label>
            <label
                >Seed карты
                <input
                    v-model="draftSeed"
                    data-testid="debug-seed"
                    type="text"
                    required
                    autocomplete="off"
                    maxlength="128"
                    spellcheck="false"
                />
            </label>
            <button data-testid="debug-apply" type="submit" :disabled="!draftSeed.trim()">
                Применить seed
            </button>
            <button data-testid="debug-regenerate" type="button" @click="newMap">
                Новая карта
            </button>
        </form>
        <div class="debug-workspace">
            <ConstellationGraph
                id="debug-sky"
                ref="graph"
                :key="generation"
                :constellation="sky"
                :selected-id="selectedId"
                @select="selectNode"
            />
            <aside class="debug-sidebar" aria-label="Каталог звёзд">
                <div
                    ref="detailsPanel"
                    class="debug-selected-details"
                    tabindex="0"
                    aria-label="Описание выбранной звезды"
                >
                    <a class="debug-map-link" href="#debug-sky">Показать на карте</a>
                    <div id="debug-star-details" data-testid="selected-star-card">
                        <ConstellationStarCard :node="selected" />
                    </div>
                    <ConstellationDebugUnlock :node-id="selectedId" />
                </div>
                <section class="debug-catalog">
                    <div class="debug-filters">
                        <label
                            >Искать звезду
                            <input
                                v-model="query"
                                data-testid="debug-search"
                                type="search"
                                autocomplete="off"
                            />
                        </label>
                        <label
                            >Созвездие
                            <select v-model="path" data-testid="debug-path">
                                <option value="">Все созвездия</option>
                                <option
                                    v-for="entry in sky.paths"
                                    :key="entry.id"
                                    :value="entry.id"
                                >
                                    {{ entry.name }}
                                </option>
                            </select>
                        </label>
                    </div>
                    <ul
                        v-if="filtered.length"
                        ref="list"
                        data-testid="debug-star-list"
                        class="debug-star-list"
                        aria-label="Звёзды"
                        @keydown="listKey"
                    >
                        <li v-for="node in filtered" :key="node.id">
                            <button
                                type="button"
                                :data-star-id="node.id"
                                :aria-pressed="selectedId === node.id"
                                aria-controls="debug-star-details"
                                @click="selectStar(node.id)"
                            >
                                <strong>{{ node.name }}</strong>
                                <span>{{ pathNames.get(node.constellationId) }}</span>
                            </button>
                        </li>
                    </ul>
                    <p v-else class="debug-empty" role="status">Звёзды не найдены.</p>
                </section>
            </aside>
        </div>
    </main>
</template>
<style scoped src="./constellationDebug.css"></style>

<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { nextTick, ref, watch } from 'vue'

import ConstellationGraph from '../ui/ConstellationGraph.vue'
import ConstellationStarCard from '../ui/ConstellationStarCard.vue'
import ConstellationBuildFeedback from './ConstellationBuildFeedback.vue'
import ConstellationBuildStatus from './ConstellationBuildStatus.vue'
import ConstellationBuildSummary from './ConstellationBuildSummary.vue'
import ConstellationBuildToolbar from './ConstellationBuildToolbar.vue'
import ConstellationDebugChance from './ConstellationDebugChance.vue'
import { debugHeroClasses } from './constellationDebugSettings'
import ConstellationDebugUnlock from './ConstellationDebugUnlock.vue'
import ConstellationMasterySummary from './ConstellationMasterySummary.vue'
import { useConstellationDebug } from './useConstellationDebug'
import { provideConstellationDebugPanels } from './useConstellationDebugPanels'

const props = withDefaults(
    defineProps<{
        syncUrl?: boolean
        initialHeroClass?: HeroClass
        initialSeed?: string
    }>(),
    { syncUrl: true }
)
const {
    enabledStarIds,
    feedback,
    lastCascade,
    toggle,
    clearFeedback,
    pauseNotice,
    resumeNotice,
    clear,
    enableAll,
    reset,
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
const debugPanels = provideConstellationDebugPanels()
function selectNode(id: string): void {
    selectedId.value = id
    clearFeedback()
}
watch(selectedId, () => {
    if (detailsPanel.value) detailsPanel.value.scrollTop = 0
})
function selectStar(id: string): void {
    graph.value?.focusNode(id)
}
function inspectParent(id: string): void {
    selectStar(id)
    document.getElementById('debug-sky')?.scrollIntoView?.({ block: 'start' })
}
async function showSummary(): Promise<void> {
    debugPanels.result = true
    await nextTick()
    detailsPanel.value?.querySelector('#debug-build-result')?.scrollIntoView?.({ block: 'start' })
}
function listToggle(event: KeyboardEvent, id: string): void {
    if (event.code !== 'Space') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) toggle(id)
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
                >Класс для карты
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
        <ConstellationBuildToolbar
            :count="enabledStarIds.size"
            @clear="clear"
            @all="enableAll"
            @reset="reset"
        />
        <p class="debug-build-help">
            Seed меняет карту. Класс добавляет стартовые звёзды; набор сохраняется.
        </p>
        <div class="debug-workspace">
            <ConstellationGraph
                id="debug-sky"
                ref="graph"
                :key="generation"
                :constellation="sky"
                :selected-id="selectedId"
                :enabled-star-ids="enabledStarIds"
                @select="selectNode"
                @activate="toggle"
            />
            <aside class="debug-sidebar" aria-label="Каталог звёзд">
                <div
                    ref="detailsPanel"
                    class="debug-selected-details"
                    tabindex="0"
                    aria-label="Описание выбранной звезды"
                >
                    <nav class="debug-card-nav" aria-label="Действия карточки">
                        <a class="debug-map-link" href="#debug-sky">Показать на карте</a
                        ><button
                            class="debug-summary-link"
                            type="button"
                            data-testid="debug-show-summary"
                            @click="showSummary"
                        >
                            Сводка
                        </button>
                    </nav>
                    <ConstellationBuildStatus
                        :name="selected.name ?? selected.id"
                        :enabled="enabledStarIds.has(selectedId)"
                        @toggle="toggle(selectedId)"
                    />
                    <div id="debug-star-details" data-testid="selected-star-card">
                        <ConstellationStarCard :node="selected" />
                    </div>
                    <ConstellationMasterySummary
                        :path="selected.constellationId"
                        :active-ids="enabledStarIds"
                        :hero-class="settings.heroClass"
                    />
                    <ConstellationBuildSummary
                        :path="selected.constellationId"
                        :active-ids="enabledStarIds"
                    />
                    <ConstellationDebugChance
                        :node-id="selectedId"
                        :enabled-star-ids="enabledStarIds"
                    />
                    <ConstellationDebugUnlock
                        :node-id="selectedId"
                        :active-ids="enabledStarIds"
                        :hero-class="settings.heroClass"
                    />
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
                        <li v-for="node in filtered" :key="node.id" class="debug-star-row">
                            <button
                                type="button"
                                :data-star-id="node.id"
                                :aria-pressed="selectedId === node.id"
                                aria-controls="debug-star-details"
                                @click="selectStar(node.id)"
                                @keydown="listToggle($event, node.id)"
                            >
                                <strong>{{ node.name }}</strong>
                                <span>{{ pathNames.get(node.constellationId) }}</span>
                            </button>
                            <button
                                type="button"
                                role="switch"
                                class="debug-star-toggle"
                                :data-star-toggle="node.id"
                                :aria-label="`В наборе: ${node.name}`"
                                :aria-checked="enabledStarIds.has(node.id)"
                                @click="toggle(node.id)"
                            >
                                {{ enabledStarIds.has(node.id) ? '✓' : '+' }}
                            </button>
                        </li>
                    </ul>
                    <p v-else class="debug-empty" role="status">Звёзды не найдены.</p>
                </section>
            </aside>
        </div>
        <ConstellationBuildFeedback
            :feedback="feedback"
            :cascade="lastCascade"
            :nodes="sky.nodes"
            @inspect="inspectParent"
            @pause="pauseNotice"
            @resume="resumeNotice"
        />
    </main>
</template>
<style scoped src="./constellationDebug.css"></style>

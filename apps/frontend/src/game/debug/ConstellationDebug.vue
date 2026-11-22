<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { ConstellationStarCard } from '@/entities/constellations'
import { ConstellationAtlasWidget } from '@/widgets/constellation-atlas'

import { resolveConstellationCardEffects } from '../../../../backend/src/game/constellationCardEffects'
import { observedConstellationCardEffects } from '../../../../backend/src/game/constellationResultDisclosure'
import GameButton from '../ui/primitives/GameButton.vue'
import GameFrame from '../ui/primitives/GameFrame.vue'
import GameInput from '../ui/primitives/GameInput.vue'
import GameSelect from '../ui/primitives/GameSelect.vue'
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

interface DebugProps {
    syncUrl?: boolean
    initialHeroClass?: HeroClass
    initialSeed?: string
}
const props = withDefaults(defineProps<DebugProps>(), { syncUrl: true })
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
const atlas = ref<InstanceType<typeof ConstellationAtlasWidget>>()
const list = ref<HTMLUListElement>()
const detailsPanel = ref<HTMLElement>()
const debugPanels = provideConstellationDebugPanels()
const characterKnowledge = ref(false)
const selectedCard = computed(() => {
    const node = selected.value
    const effects = characterKnowledge.value
        ? observedConstellationCardEffects(node.id, enabledStarIds.value)
        : resolveConstellationCardEffects(node.id, enabledStarIds.value)
    return { ...node, effects: effects ?? [] }
})
function selectNode(id: string): void {
    selectedId.value = id
    clearFeedback()
}
watch(selectedId, () => {
    if (detailsPanel.value) detailsPanel.value.scrollTop = 0
})
function inspectParent(id: string): void {
    atlas.value?.focusNode(id)
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
            <p>Всего звёзд: {{ sky.nodes.length }}. Просмотр не меняет развитие героя.</p>
        </header>
        <form class="debug-settings" @submit.prevent="applySeed">
            <label
                >Класс для карты
                <GameSelect
                    data-testid="debug-class"
                    :value="settings.heroClass"
                    @change="changeClass(($event.target as HTMLSelectElement).value as HeroClass)"
                >
                    <option v-for="hero in debugHeroClasses" :key="hero.id" :value="hero.id">
                        {{ hero.name }}
                    </option>
                </GameSelect>
            </label>
            <label
                >Seed карты
                <GameInput
                    v-model="draftSeed"
                    data-testid="debug-seed"
                    type="text"
                    required
                    autocomplete="off"
                    maxlength="128"
                    spellcheck="false"
                />
            </label>
            <GameButton
                variant="primary"
                size="compact"
                data-testid="debug-apply"
                type="submit"
                :disabled="!draftSeed.trim()"
            >
                Применить seed
            </GameButton>
            <GameButton size="compact" data-testid="debug-regenerate" @click="newMap">
                Новая карта
            </GameButton>
        </form>
        <ConstellationBuildToolbar
            :count="enabledStarIds.size"
            :total="sky.nodes.length"
            @clear="clear"
            @all="enableAll"
            @reset="reset"
        />
        <label class="debug-build-help">
            <GameInput
                v-model="characterKnowledge"
                type="checkbox"
                data-testid="debug-character-knowledge"
            />
            Карточка: знания персонажа из выбранного набора звёзд
        </label>
        <p class="debug-build-help">
            Seed меняет карту. Класс добавляет стартовые звёзды; набор сохраняется.
        </p>
        <ConstellationAtlasWidget
            ref="atlas"
            class="debug-workspace"
            map-id="debug-sky"
            :map-key="generation"
            :constellation="sky"
            :selected-star="selectedCard"
            :enabled-star-ids="enabledStarIds"
            @select="selectNode"
            @activate="toggle"
        >
            <template #sidebar="{ node }">
                <aside class="debug-sidebar" aria-label="Каталог звёзд">
                    <div
                        ref="detailsPanel"
                        class="debug-selected-details"
                        tabindex="0"
                        aria-label="Описание выбранной звезды"
                    >
                        <nav class="debug-card-nav" aria-label="Действия карточки">
                            <a class="debug-map-link game-frame-host" href="#debug-sky"
                                ><GameFrame variant="inset" />Показать на карте</a
                            ><GameButton
                                size="compact"
                                class="debug-summary-link"
                                data-testid="debug-show-summary"
                                @click="showSummary"
                            >
                                Сводка
                            </GameButton>
                        </nav>
                        <ConstellationBuildStatus
                            :name="selected.name ?? selected.id"
                            :enabled="enabledStarIds.has(selectedId)"
                            @toggle="toggle(selectedId)"
                        />
                        <div id="debug-star-details" data-testid="selected-star-card">
                            <ConstellationStarCard v-if="node" :node="node" />
                        </div>
                        <ConstellationMasterySummary
                            :path="selected.constellationId"
                            :active-ids="enabledStarIds"
                            :hero-class="settings.heroClass"
                        />
                        <ConstellationBuildSummary
                            :node-id="selectedId"
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
                    <section class="debug-catalog game-frame-host">
                        <GameFrame variant="panel" />
                        <div class="debug-filters">
                            <label
                                >Искать звезду
                                <GameInput
                                    v-model="query"
                                    data-testid="debug-search"
                                    type="search"
                                    autocomplete="off"
                                />
                            </label>
                            <label
                                >Созвездие
                                <GameSelect v-model="path" data-testid="debug-path">
                                    <option value="">Все созвездия</option>
                                    <option
                                        v-for="entry in sky.paths"
                                        :key="entry.id"
                                        :value="entry.id"
                                    >
                                        {{ entry.name }}
                                    </option>
                                </GameSelect>
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
                                <GameButton
                                    size="compact"
                                    :data-star-id="node.id"
                                    :aria-pressed="selectedId === node.id"
                                    aria-controls="debug-star-details"
                                    @click="atlas?.focusNode(node.id)"
                                    @keydown="listToggle($event, node.id)"
                                >
                                    <strong>{{ node.name }}</strong>
                                    <span>{{ pathNames.get(node.constellationId) }}</span>
                                </GameButton>
                                <GameButton
                                    size="compact"
                                    role="switch"
                                    class="debug-star-toggle"
                                    :data-star-toggle="node.id"
                                    :aria-label="`В наборе: ${node.name}`"
                                    :aria-checked="enabledStarIds.has(node.id)"
                                    @click="toggle(node.id)"
                                >
                                    {{ enabledStarIds.has(node.id) ? '✓' : '+' }}
                                </GameButton>
                            </li>
                        </ul>
                        <p v-else class="debug-empty" role="status">Звёзды не найдены.</p>
                    </section>
                </aside>
            </template>
        </ConstellationAtlasWidget>
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

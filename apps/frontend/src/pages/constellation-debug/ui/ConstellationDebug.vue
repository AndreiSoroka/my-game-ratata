<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { ConstellationStarCard } from '@/entities/constellations'
import { UiButton, UiFrame, UiInput, UiSelect } from '@/shared/ui/common'
import { ConstellationAtlasWidget } from '@/widgets/constellation-atlas'

import { resolveConstellationCardEffects } from '../../../../../backend/src/game/constellationCardEffects'
import { observedConstellationCardEffects } from '../../../../../backend/src/game/constellationResultDisclosure'
import { debugHeroClasses } from '../model/constellationDebugSettings'
import {
    type ConstellationDebugOptions,
    useConstellationDebug,
} from '../model/useConstellationDebug'
import { provideConstellationDebugPanels } from '../model/useConstellationDebugPanels'
import ConstellationBuildFeedback from './ConstellationBuildFeedback.vue'
import ConstellationBuildStatus from './ConstellationBuildStatus.vue'
import ConstellationBuildSummary from './ConstellationBuildSummary.vue'
import ConstellationBuildToolbar from './ConstellationBuildToolbar.vue'
import ConstellationDebugChance from './ConstellationDebugChance.vue'
import ConstellationDebugUnlock from './ConstellationDebugUnlock.vue'
import ConstellationMasterySummary from './ConstellationMasterySummary.vue'

const props = withDefaults(defineProps<ConstellationDebugOptions>(), { syncUrl: true })
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
                <UiSelect
                    :border-width="4"
                    data-testid="debug-class"
                    :value="settings.heroClass"
                    @change="changeClass(($event.target as HTMLSelectElement).value as HeroClass)"
                >
                    <option v-for="hero in debugHeroClasses" :key="hero.id" :value="hero.id">
                        {{ hero.name }}
                    </option>
                </UiSelect>
            </label>
            <label
                >Seed карты
                <UiInput
                    :border-width="4"
                    v-model="draftSeed"
                    data-testid="debug-seed"
                    type="text"
                    required
                    autocomplete="off"
                    maxlength="128"
                    spellcheck="false"
                />
            </label>
            <UiButton
                variant="primary"
                size="compact"
                data-testid="debug-apply"
                type="submit"
                :disabled="!draftSeed.trim()"
            >
                Применить seed
            </UiButton>
            <UiButton size="compact" data-testid="debug-regenerate" @click="newMap">
                Новая карта
            </UiButton>
        </form>
        <ConstellationBuildToolbar
            :count="enabledStarIds.size"
            :total="sky.nodes.length"
            @clear="clear"
            @all="enableAll"
            @reset="reset"
        />
        <label class="debug-build-help">
            <UiInput
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
                                ><UiFrame variant="inset" />Показать на карте</a
                            ><UiButton
                                size="compact"
                                class="debug-summary-link"
                                data-testid="debug-show-summary"
                                @click="showSummary"
                            >
                                Сводка
                            </UiButton>
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
                        <UiFrame variant="panel" />
                        <div class="debug-filters">
                            <label
                                >Искать звезду
                                <UiInput
                                    :border-width="4"
                                    v-model="query"
                                    data-testid="debug-search"
                                    type="search"
                                    autocomplete="off"
                                />
                            </label>
                            <label
                                >Созвездие
                                <UiSelect :border-width="4" v-model="path" data-testid="debug-path">
                                    <option value="">Все созвездия</option>
                                    <option
                                        v-for="entry in sky.paths"
                                        :key="entry.id"
                                        :value="entry.id"
                                    >
                                        {{ entry.name }}
                                    </option>
                                </UiSelect>
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
                                <UiButton
                                    size="compact"
                                    :data-star-id="node.id"
                                    :aria-pressed="selectedId === node.id"
                                    :selected="selectedId === node.id"
                                    aria-controls="debug-star-details"
                                    @click="atlas?.focusNode(node.id)"
                                    @keydown="listToggle($event, node.id)"
                                >
                                    <strong>{{ node.name }}</strong>
                                    <span>{{ pathNames.get(node.constellationId) }}</span>
                                </UiButton>
                                <UiButton
                                    size="compact"
                                    role="switch"
                                    class="debug-star-toggle"
                                    :data-star-toggle="node.id"
                                    :aria-label="`В наборе: ${node.name}`"
                                    :aria-checked="enabledStarIds.has(node.id)"
                                    :selected="enabledStarIds.has(node.id)"
                                    @click="toggle(node.id)"
                                >
                                    {{ enabledStarIds.has(node.id) ? '✓' : '+' }}
                                </UiButton>
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

<script setup lang="ts">
import './automationControls.css'

import type {
    AutomationCommand,
    AutomationSnapshot,
    CharacterSnapshot,
    ScenarioRunSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import { gameKeyBlocked } from './keyboardOwnership'
import MarkerPanel from './MarkerPanel.vue'
import GameFrame from './primitives/GameFrame.vue'
import ScenarioPanel from './ScenarioPanel.vue'
import ScenarioRunStatus from './ScenarioRunStatus.vue'
import { scenarioVisibleTargets } from './scenarioTargets'

const props = defineProps<{
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    game?: RatataGame
    connected: boolean
    blocked: boolean
}>()
const emit = defineEmits<{ command: [command: AutomationCommand]; open: [] }>()
const activeWindow = ref<'markers' | 'scenarios' | null>(null)
const empty: AutomationSnapshot = { markers: [], scenarios: [], run: null, helpers: [] }
const automation = computed(() => props.snapshot.automation ?? empty)
const available = computed(() => props.connected && props.player.alive)
const targets = computed(() =>
    scenarioVisibleTargets(
        props.snapshot,
        props.player,
        props.characters,
        (position, bounds) => props.game?.isInteractionVisible(position, bounds, 240) ?? false
    )
)
const activeRuns = computed(() => {
    const runs = [automation.value.run, ...automation.value.helpers.map((entry) => entry.run)]
    return runs.filter((run): run is ScenarioRunSnapshot =>
        Boolean(
            run && run.ownerId === props.player.id && ['running', 'paused'].includes(run.status)
        )
    )
})
function open(window: 'markers' | 'scenarios'): void {
    emit('open')
    props.game?.releaseUiControls()
    activeWindow.value = window
}
function close(): void {
    if (!activeWindow.value) return
    activeWindow.value = null
    void nextTick(() => document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus())
}
function create(name?: string): void {
    if (!available.value || automation.value.markers.length >= 64) return
    emit('command', { type: 'marker_create', ...(name ? { name } : {}) })
}
function key(event: KeyboardEvent): void {
    if (event.code !== 'KeyN' || props.blocked || activeWindow.value || gameKeyBlocked(event))
        return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!event.repeat) create()
}
function control(
    run: ScenarioRunSnapshot,
    type: 'scenario_pause' | 'scenario_resume' | 'scenario_stop'
): void {
    emit('command', { type, ...(run.actorId === props.player.id ? {} : { targetId: run.actorId }) })
}
function actorName(actorId: string): string {
    return actorId === props.player.id
        ? 'Мой персонаж'
        : (automation.value.helpers.find((entry) => entry.actorId === actorId)?.name ?? 'Спутник')
}
watch(
    () => props.player.id,
    () => {
        activeWindow.value = null
    }
)
onMounted(() => window.addEventListener('keydown', key, true))
onBeforeUnmount(() => window.removeEventListener('keydown', key, true))
defineExpose({ open, close, create, hasOpenWindow: computed(() => activeWindow.value !== null) })
</script>

<template>
    <div
        v-if="activeRuns.length && !activeWindow"
        class="automation-mini automation-form rpg-panel game-frame-host"
    >
        <GameFrame variant="panel" />
        <ScenarioRunStatus
            v-for="run in activeRuns"
            :key="run.actorId"
            :run="run"
            :actor-name="actorName(run.actorId)"
            compact
            :can-control="connected"
            @pause="control(run, 'scenario_pause')"
            @resume="control(run, 'scenario_resume')"
            @stop="control(run, 'scenario_stop')"
        />
    </div>
    <MarkerPanel
        v-if="activeWindow === 'markers'"
        :markers="automation.markers"
        :available="available"
        @close="close"
        @create="create"
        @rename="(markerId, name) => emit('command', { type: 'marker_rename', markerId, name })"
        @delete="(markerId) => emit('command', { type: 'marker_delete', markerId })"
    />
    <ScenarioPanel
        v-else-if="activeWindow === 'scenarios'"
        :automation="automation"
        :player-id="player.id"
        :available="available"
        :targets="targets"
        @close="close"
        @command="emit('command', $event)"
    />
</template>

<style scoped>
.automation-mini {
    position: absolute;
    z-index: 6;
    left: 16px;
    top: 250px;
    width: min(290px, calc(100% - 32px));
    max-height: 180px;
    overflow: auto;
    padding: 10px;
    font-size: 11px;
    box-sizing: border-box;
}
.automation-mini :deep(button) {
    min-height: 30px;
    padding: 4px 8px;
    font-size: 11px;
}
@media (max-width: 600px) {
    .automation-mini {
        left: 8px;
        top: 250px;
        max-height: 145px;
        width: min(240px, calc(100% - 16px));
    }
}
</style>

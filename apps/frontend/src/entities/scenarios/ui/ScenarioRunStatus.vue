<script setup lang="ts">
import './scenarioPresentation.css'

import type { ScenarioRunSnapshot } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'

defineProps<{
    run: ScenarioRunSnapshot
    compact?: boolean
    canControl?: boolean
    actorName?: string
    serverTime?: number
}>()
const emit = defineEmits<{ pause: []; resume: []; stop: [] }>()
const status = {
    get running() {
        return tGame('game.quests.inProgress')
    },
    get paused() {
        return tGame('game.automation.pause')
    },
    get completed() {
        return tGame('game.automation.finished')
    },
    get stopped() {
        return tGame('game.automation.stopped')
    },
}
const steps = {
    get pending() {
        return tGame('game.automation.waiting')
    },
    get running() {
        return tGame('game.quests.inProgress')
    },
    get succeeded() {
        return tGame('game.automation.ready')
    },
    get failed() {
        return tGame('game.automation.failed')
    },
    get skipped() {
        return tGame('game.automation.skipped')
    },
}
const interruptions = {
    get conversation() {
        return tGame('game.automation.conversation')
    },
    get death() {
        return tGame('game.automation.characterDied')
    },
}
</script>

<template>
    <section class="automation-status" :aria-label="tGame('game.automation.scenarioProgress')">
        <p aria-live="polite">
            <span v-if="actorName">{{ actorName }} · </span>
            <strong>{{ run.name }}</strong> · {{ status[run.status] }}
            <span v-if="run.status === 'running' || run.status === 'paused'">
                <template v-if="run.phase === 'reaction' && run.sequenceName">
                    · {{ tGame('game.automation.activeReaction', { name: run.sequenceName }) }}
                </template>
                <template v-else-if="run.phase === 'between_passes'">
                    · {{ tGame('game.automation.beforeNextPass') }}
                </template>
                <template v-if="run.phase !== 'between_passes' && run.results.length">
                    {{ tGame('game.automation.stepScenarioRun') }} {{ run.stepIndex + 1 }}/{{
                        run.results.length
                    }}
                </template>
                {{ tGame('game.automation.loop') }} {{ run.iteration }}
            </span>
        </p>
        <p
            v-if="run.status === 'running' && run.nextPassAt !== null && serverTime !== undefined"
            class="automation-muted"
        >
            {{ Math.max(0, Math.ceil((run.nextPassAt - serverTime) / 1000)) }}
            {{ tGame('game.knowledge.s') }}
        </p>
        <p v-if="run.interruption" class="automation-muted">
            {{ interruptions[run.interruption] }}
        </p>
        <p v-if="run.reason" :class="{ 'automation-error': run.status === 'paused' }">
            {{ run.reason }}
        </p>
        <p v-if="run.remainingFailureMs > 0" class="automation-muted">
            {{ tGame('game.automation.waitingForResult') }}
            {{ Math.ceil(run.remainingFailureMs / 1000) }} {{ tGame('game.knowledge.s') }}
        </p>
        <div
            v-if="canControl && (run.status === 'running' || run.status === 'paused')"
            class="automation-row"
        >
            <UiButton v-if="run.status === 'running'" @click="emit('pause')">
                {{ tGame('game.automation.pause') }}
            </UiButton>
            <UiButton v-else @click="emit('resume')">{{
                tGame('game.automation.resume')
            }}</UiButton>
            <UiButton @click="emit('stop')">{{ tGame('game.automation.stop') }}</UiButton>
        </div>
        <ol v-if="!compact" class="scenario-results">
            <li v-for="(result, index) in run.results" :key="result.stepId">
                {{ index + 1 }}. {{ steps[result.status] }}
                <span v-if="result.failures">
                    {{ tGame('game.automation.failures') }} {{ result.failures }}</span
                >
                <span v-if="result.reason" class="automation-muted"> · {{ result.reason }}</span>
            </li>
        </ol>
    </section>
</template>

<style scoped>
.automation-status {
    display: grid;
    gap: 8px;
}
.scenario-results {
    display: grid;
    gap: 6px;
    list-style: none;
    padding: 0;
    margin: 4px 0 0;
    font-size: 12px;
}
</style>

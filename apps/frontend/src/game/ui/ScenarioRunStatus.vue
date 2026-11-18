<script setup lang="ts">
import type { ScenarioRunSnapshot } from '@my-game-ratata/contracts'

import GameButton from './primitives/GameButton.vue'

defineProps<{
    run: ScenarioRunSnapshot
    compact?: boolean
    canControl?: boolean
    actorName?: string
}>()
const emit = defineEmits<{ pause: []; resume: []; stop: [] }>()
const status = {
    running: 'Выполняется',
    paused: 'Пауза',
    completed: 'Завершён',
    stopped: 'Остановлен',
}
const steps = {
    pending: 'Ожидает',
    running: 'Выполняется',
    succeeded: 'Готово',
    failed: 'Не удалось',
}
const interruptions = { enemy: 'Рядом враг', conversation: 'Разговор', death: 'Персонаж погиб' }
</script>

<template>
    <section class="automation-status" aria-label="Выполнение сценария">
        <p aria-live="polite">
            <span v-if="actorName">{{ actorName }} · </span>
            <strong>{{ run.name }}</strong> · {{ status[run.status] }}
            <span v-if="run.status === 'running' || run.status === 'paused'">
                · шаг {{ run.stepIndex + 1 }}/{{ run.results.length }} · круг {{ run.iteration }}
            </span>
        </p>
        <p v-if="run.interruption" class="automation-muted">
            {{ interruptions[run.interruption] }}
        </p>
        <p v-if="run.reason" :class="{ 'automation-error': run.status === 'paused' }">
            {{ run.reason }}
        </p>
        <p v-if="run.remainingFailureMs > 0" class="automation-muted">
            Ожидание результата: {{ Math.ceil(run.remainingFailureMs / 1000) }} с
        </p>
        <div
            v-if="canControl && (run.status === 'running' || run.status === 'paused')"
            class="automation-row"
        >
            <GameButton v-if="run.status === 'running'" @click="emit('pause')"> Пауза </GameButton>
            <GameButton v-else @click="emit('resume')">Продолжить</GameButton>
            <GameButton @click="emit('stop')">Остановить</GameButton>
        </div>
        <ol v-if="!compact" class="scenario-results">
            <li v-for="(result, index) in run.results" :key="result.stepId">
                {{ index + 1 }}. {{ steps[result.status] }}
                <span v-if="result.failures"> · неудач: {{ result.failures }}</span>
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

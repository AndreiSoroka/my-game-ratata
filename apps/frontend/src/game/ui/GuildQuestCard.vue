<script setup lang="ts">
import type { ClientMessage, GuildQuestSnapshot } from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

import { itemAssetCatalog } from '../assets/itemCatalog'
import QuestRewardSummary from './QuestRewardSummary.vue'

const props = defineProps<{
    job: GuildQuestSnapshot
    playerId?: string
    canAct?: boolean
    canAbandon?: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const progressId = useId()
const request = computed(() => props.job.workRequest)
const trophy = computed(() => request.value && itemAssetCatalog[request.value.requiredTrophyItemId])
const stageLabels = {
    reporting: 'Работник идёт за помощью',
    waiting: 'Работник ждёт у распорядителя',
    outbound: 'Работник идёт к участку',
    working: 'Работник пробует работать',
    returning: 'Работник возвращается к распорядителю',
    ready: 'Проверка пройдена — получите награду',
    completed: 'Работник возвращается к обычной работе',
    cancelled: 'Обращение отменено',
}
const status = computed(() =>
    request.value
        ? stageLabels[request.value.stage]
        : {
              active: 'Выполняется',
              ready: 'Можно получить награду',
              completed: 'Завершено',
          }[props.job.status]
)
const progressLabel = computed(() =>
    props.job.id === 'survey_frontier'
        ? 'Исследовано разных земель'
        : props.job.id === 'skeleton_hunt'
          ? 'Побеждено скелетов'
          : 'Побеждено враждебных слизней'
)
</script>

<template>
    <article class="quest-card guild-active" aria-label="Общий контракт">
        <span class="quest-card-status">{{ status }}</span>
        <h2>{{ job.title }}</h2>
        <p>{{ job.description }}</p>
        <template v-if="request">
            <dl class="quest-request-facts">
                <div>
                    <dt>Заказчик</dt>
                    <dd>{{ request.workerName }}</dd>
                </div>
                <div>
                    <dt>Участок</dt>
                    <dd>{{ request.locationName }}</dd>
                </div>
                <div>
                    <dt>Замеченный враг</dt>
                    <dd>{{ request.enemyName }}</dd>
                </div>
            </dl>
            <p v-if="request.proofAccepted" class="quest-card-hint">
                Трофей принят. Повторные пробные рейсы бесплатны.
            </p>
            <p v-else-if="trophy" class="quest-trophy">
                <img :src="trophy.src" :alt="trophy.label" />
                <span>Для доклада: {{ trophy.label }} ×1. Подойдёт трофей, найденный раньше.</span>
            </p>
            <p class="quest-card-hint">
                Нужно дождаться одного этапа работы и возвращения работника.
            </p>
            <p v-if="request.reason" class="quest-card-reason" role="status">
                {{ request.reason }}
            </p>
        </template>
        <template v-else>
            <p class="quest-card-hint">
                {{
                    job.id === 'survey_frontier'
                        ? 'Засчитываются посещённые земли за пределами города.'
                        : 'Засчитываются победы по принятому контракту. Сердца и другие предметы сдавать не нужно.'
                }}
            </p>
            <label :for="progressId"
                >{{ progressLabel }}: {{ job.progress }} / {{ job.goal }}</label
            >
            <progress :id="progressId" :value="job.progress" :max="job.goal" />
            <ul v-if="job.participants.length" class="guild-contributions">
                <li v-for="participant in job.participants" :key="participant.id">
                    <span>{{ participant.nickname }}</span>
                    <strong>{{ participant.contribution }} · вклад в цель</strong>
                </li>
            </ul>
        </template>
        <QuestRewardSummary
            :total="job.rewardGold"
            :mode="job.rewardMode"
            :shares="job.rewardShares"
            :player-id="playerId"
            :completed="job.status === 'completed'"
        />
        <div
            v-if="job.status !== 'completed' && request?.stage !== 'cancelled'"
            class="guild-reward quest-card-actions"
        >
            <button
                v-if="request?.stage === 'waiting'"
                type="button"
                :disabled="!canAct"
                @click="emit('command', { type: 'guild_report', instanceId: job.instanceId })"
            >
                {{
                    request.proofAccepted ? 'Повторить пробный рейс' : 'Передать трофей и доложить'
                }}
            </button>
            <button
                v-if="job.status === 'ready'"
                type="button"
                :disabled="!canAct"
                @click="emit('command', { type: 'guild_turn_in', instanceId: job.instanceId })"
            >
                Сдать контракт
            </button>
            <button
                v-if="request"
                type="button"
                :disabled="!canAbandon"
                @click="emit('command', { type: 'guild_abandon', instanceId: job.instanceId })"
            >
                Отказаться от обращения
            </button>
        </div>
    </article>
</template>

<style scoped>
.quest-card {
    border-top: 1px solid #526049;
    padding-top: 12px;
    margin-top: 16px;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.quest-card h2 {
    margin: 6px 0;
    font-size: 18px;
}
.quest-card-status {
    color: #a2c192;
    font-size: 11px;
}
.quest-card-hint {
    color: #b4c0ac;
}
.quest-card progress {
    display: block;
    width: 100%;
    height: 8px;
    accent-color: #d3bb7c;
}
.guild-contributions {
    list-style: none;
    padding: 0;
}
.guild-contributions li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
}
.quest-request-facts {
    display: grid;
    gap: 5px;
}
.quest-request-facts div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.quest-request-facts dt {
    color: #b4c0ac;
}
.quest-request-facts dd {
    margin: 0;
}
.quest-trophy {
    display: flex;
    align-items: center;
    gap: 8px;
}
.quest-trophy img {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
}
.quest-card-reason {
    padding: 8px;
    border-left: 2px solid #d3bb7c;
    background: #353d2a;
}
.quest-card-actions {
    display: flex;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}
.quest-card-actions button {
    font: inherit;
}
</style>

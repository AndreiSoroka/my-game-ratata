<script setup lang="ts">
import {
    type ClientMessage,
    type GuildQuestSnapshot,
    npcQuestMessage,
} from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

import { characterName, itemName, locationName, tGame, tLocalized } from '@/shared/lib/i18n'

import { itemAssetCatalog } from '../assets/itemCatalog'
import ItemIcon from './ItemIcon.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'

const props = defineProps<{
    job: GuildQuestSnapshot
    playerId?: string
    canAct?: boolean
    canAbandon?: boolean
    actions?: 'all' | 'abandon'
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const progressId = useId()
const request = computed(() => props.job.workRequest)
const trophy = computed(() => request.value && itemAssetCatalog[request.value.requiredTrophyItemId])
const stageLabels = {
    get reporting() {
        return tGame('game.quests.workerReports')
    },
    get waiting() {
        return tGame('game.quests.workerWaits')
    },
    get outbound() {
        return tGame('game.quests.workerHeadsToSite')
    },
    get working() {
        return tGame('game.quests.workerVerifies')
    },
    get returning() {
        return tGame('game.quests.workerReturns')
    },
    get ready() {
        return tGame('game.quests.verificationSucceeded')
    },
    get completed() {
        return tGame('game.quests.workerResumes')
    },
    get cancelled() {
        return tGame('game.quests.requestCancelled')
    },
}
const status = computed(() =>
    props.job.status === 'reward_missing'
        ? tGame('game.quests.rewardMissing')
        : request.value
          ? stageLabels[request.value.stage]
          : {
                active: tGame('game.quests.inProgress'),
                ready: tGame('game.quests.rewardReady'),
                completed: tGame('game.quests.completed'),
                cancelled: tGame('game.quests.cancelled'),
                reward_missing: tGame('game.quests.rewardMissing'),
            }[props.job.status]
)
const progressLabel = computed(() =>
    props.job.id === 'survey_frontier'
        ? tGame('game.quests.landsExplored')
        : props.job.id === 'skeleton_hunt'
          ? tGame('game.quests.skeletonsDefeated')
          : tGame('game.quests.hostileSlimesDefeated')
)
</script>

<template>
    <article
        class="quest-card guild-active game-frame-host"
        :aria-label="tGame('game.quests.sharedContract')"
    >
        <GameFrame variant="panel" />
        <span class="quest-card-status">{{ status }}</span>
        <h2>{{ tLocalized(job.titleMessage, job.title) }}</h2>
        <p>{{ tLocalized(job.descriptionMessage, job.description) }}</p>
        <template v-if="request">
            <dl class="quest-request-facts">
                <div>
                    <dt>{{ tGame('game.quests.questGiverGuildQuest') }}</dt>
                    <dd>{{ characterName(request.workerId, request.workerName) }}</dd>
                </div>
                <div>
                    <dt>{{ tGame('game.quests.reportAndReward') }}</dt>
                    <dd>
                        {{
                            characterName(
                                job.issuerId ?? request.clerkId,
                                job.issuerName ?? tGame('game.quests.citySteward')
                            )
                        }}
                    </dd>
                </div>
                <div>
                    <dt>{{ tGame('game.quests.worksite') }}</dt>
                    <dd>{{ locationName(request.locationId, request.locationName) }}</dd>
                </div>
                <div>
                    <dt>{{ tGame('game.quests.spottedEnemy') }}</dt>
                    <dd>{{ request.enemyName }}</dd>
                </div>
            </dl>
            <p v-if="request.proofAccepted" class="quest-card-hint">
                {{ tGame('game.quests.trophyAcceptedAnotherVerificationTrip') }}
            </p>
            <p v-else-if="trophy" class="quest-trophy">
                <img :src="trophy.src" :alt="itemName(request.requiredTrophyItemId)" />
                <span
                    >{{ tGame('game.quests.forReport') }}
                    {{ itemName(request.requiredTrophyItemId) }}
                    {{ tGame('game.quests.trophyFoundEarlierCounts') }}</span
                >
            </p>
            <p class="quest-card-hint">
                {{ tGame('game.quests.waitForWorkerCompleteOne') }}
            </p>
            <p v-if="request.reason" class="quest-card-reason" role="status">
                {{ tLocalized(npcQuestMessage(request.reason), request.reason) }}
            </p>
        </template>
        <template v-else>
            <p class="quest-card-hint">
                {{
                    job.id === 'survey_frontier'
                        ? tGame('game.quests.visitedLandsCount')
                        : tGame('game.quests.combatContribution')
                }}
            </p>
            <label :for="progressId"
                >{{ progressLabel }}: {{ job.progress }} / {{ job.goal }}</label
            >
            <progress :id="progressId" :value="job.progress" :max="job.goal" />
            <ul v-if="job.participants.length" class="guild-contributions">
                <li v-for="participant in job.participants" :key="participant.id">
                    <span>{{ participant.nickname }}</span>
                    <strong
                        >{{ participant.contribution }}
                        {{ tGame('game.quests.contributionObjective') }}</strong
                    >
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
        <ul v-if="job.rewardItems?.length" class="quest-reward-items">
            <li v-for="item in job.rewardItems" :key="item.instanceId">
                <ItemIcon :item="item" /><span
                    >{{ item.quantity ?? 1 }} {{ tGame('game.quests.pcsWhoeverTurnsItIn') }}</span
                >
            </li>
        </ul>
        <p v-if="job.rewardNotice" class="quest-card-reason" role="status">
            {{ tLocalized(job.rewardNoticeMessage, job.rewardNotice) }}
        </p>
        <div
            v-if="job.status !== 'completed' && request?.stage !== 'cancelled'"
            class="guild-reward quest-card-actions"
        >
            <GameButton
                v-if="actions !== 'abandon' && request?.stage === 'waiting'"
                :disabled="!canAct"
                @click="emit('command', { type: 'guild_report', instanceId: job.instanceId })"
            >
                {{
                    request.proofAccepted
                        ? tGame('game.quests.repeatVerification')
                        : tGame('game.quests.submitTrophy')
                }}
            </GameButton>
            <GameButton
                v-if="actions !== 'abandon' && job.status === 'ready'"
                :disabled="!canAct"
                @click="emit('command', { type: 'guild_turn_in', instanceId: job.instanceId })"
            >
                {{ tGame('game.quests.turnInContract') }}
            </GameButton>
            <GameButton
                v-if="request || actions === 'abandon'"
                :disabled="!canAbandon"
                @click="emit('command', { type: 'guild_abandon', instanceId: job.instanceId })"
            >
                {{
                    request
                        ? tGame('game.quests.declineWorkerRequest')
                        : tGame('game.quests.declineContract')
                }}
            </GameButton>
        </div>
    </article>
</template>

<style scoped>
.quest-card {
    position: relative;
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
.quest-reward-items {
    padding: 0;
    list-style: none;
}
.quest-reward-items li {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
}
</style>

<script setup lang="ts">
import { type GuildQuestSnapshot, npcQuestMessage } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { characterName, locationName, tGame, tLocalized } from '@/shared/lib/i18n'
import { darkPanelButtonColors, GameBar, UiButton } from '@/shared/ui/common'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import QuestItemList from './QuestItemList.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'

const props = defineProps<{
    job: GuildQuestSnapshot
    playerId?: string
    canAbandon?: boolean
}>()
const emit = defineEmits<{ abandon: [instanceId: string] }>()
const theme = useDarkPanelTheme()
const request = computed(() => props.job.workRequest)
const rewardItems = computed(
    () =>
        props.job.rewardItems?.map(({ itemId, quantity }) => ({
            itemId,
            quantity: quantity ?? 1,
        })) ?? []
)
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
    <FantasyBorder
        class="quest-card"
        role="article"
        :border="theme?.border ?? 'border-026'"
        color="var(--quest-card-border)"
        :style="darkPanelThemeStyle(theme)"
        :aria-label="tGame('game.quests.sharedContract')"
    >
        <header class="quest-card-heading">
            <span
                class="quest-card-status"
                :class="{
                    'quest-card-status--blocked':
                        request?.reason || job.status === 'reward_missing',
                }"
                >{{ status }}</span
            >
            <h2>{{ tLocalized(job.titleMessage, job.title) }}</h2>
            <p>{{ tLocalized(job.descriptionMessage, job.description) }}</p>
        </header>
        <FantasyDivider
            divider="divider-002"
            ends="both"
            color="var(--quest-card-border)"
            aria-hidden="true"
        />
        <div v-if="request" class="quest-card-objective">
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
            <template v-else>
                <p>{{ tGame('game.quests.forReport') }}</p>
                <QuestItemList
                    class="quest-card-items"
                    :items="[{ itemId: request.requiredTrophyItemId, quantity: 1 }]"
                    :show-heading="false"
                />
            </template>
            <p class="quest-card-hint">
                {{ tGame('game.quests.waitForWorkerCompleteOne') }}
            </p>
            <p v-if="request.reason" class="quest-card-reason" role="status">
                {{ tLocalized(npcQuestMessage(request.reason), request.reason) }}
            </p>
        </div>
        <div v-else class="quest-card-objective">
            <p class="quest-card-hint">
                {{
                    job.id === 'survey_frontier'
                        ? tGame('game.quests.visitedLandsCount')
                        : tGame('game.quests.combatContribution')
                }}
            </p>
            <div class="quest-card-progress">
                <p>
                    {{ progressLabel }} <strong>{{ job.progress }} / {{ job.goal }}</strong>
                </p>
                <GameBar
                    :label="progressLabel"
                    :value="job.progress"
                    :max="job.goal"
                    :height="8"
                    color="var(--ui-dark-panel-positive)"
                    track-color="var(--ui-dark-bar-track)"
                    :shadow="false"
                />
            </div>
            <ul v-if="job.participants.length" class="guild-contributions">
                <li v-for="participant in job.participants" :key="participant.id">
                    <span>{{ participant.nickname }}</span>
                    <strong
                        >{{ participant.contribution }}
                        {{ tGame('game.quests.contributionObjective') }}</strong
                    >
                </li>
            </ul>
        </div>
        <div class="quest-card-reward">
            <QuestRewardSummary
                :total="job.rewardGold"
                :mode="job.rewardMode"
                :shares="job.rewardShares"
                :player-id="playerId"
                :completed="job.status === 'completed'"
            />
            <QuestItemList
                class="quest-card-items"
                :items="rewardItems"
                kind="reward"
                :show-heading="false"
            />
            <p v-if="job.rewardNotice" class="quest-card-reason" role="status">
                {{ tLocalized(job.rewardNoticeMessage, job.rewardNotice) }}
            </p>
        </div>
        <template
            v-if="
                job.status === 'active' || job.status === 'ready' || job.status === 'reward_missing'
            "
        >
            <p class="quest-card-hint">
                {{ tGame('game.character.askQuestGiverAboutNext') }}
            </p>
            <footer class="quest-card-actions">
                <UiButton
                    appearance="panel"
                    panel="panel-001"
                    :colors="darkPanelButtonColors"
                    :disabled="!canAbandon"
                    @click="emit('abandon', job.instanceId)"
                >
                    {{
                        request
                            ? tGame('game.quests.declineWorkerRequest')
                            : tGame('game.quests.declineContract')
                    }}
                </UiButton>
            </footer>
        </template>
    </FantasyBorder>
</template>

<style scoped src="./guildQuestCard.css"></style>

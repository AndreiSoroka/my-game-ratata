<script setup lang="ts">
import type {
    ClientMessage,
    QuestRewardMode,
    QuestTurnInPromptSnapshot,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { QuestItemList, QuestRewardSummary, QuestTurnInPanel } from '@/entities/quests'
import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'

import PrivateConversation from './PrivateConversation.vue'
import { questObjectiveText } from './questTermsText'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{
    prompt: QuestTurnInPromptSnapshot
    serverTime: number
    playerId: string
    conversation?: WhisperSnapshot | null
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const pending = ref(false)
const rewardMode = ref<QuestRewardMode>(props.prompt.rewardMode)
const expired = computed(() => props.serverTime >= props.prompt.expiresAt)
const objectives = computed(() =>
    Array.from(
        { length: Math.max(props.prompt.objectiveLabels.length, props.prompt.objectives.length) },
        (_, index) => questObjectiveText(props.prompt, index, props.prompt.objectives[index])
    )
)
const requiredItems = computed(() =>
    props.prompt.objectives.filter((objective) => objective.kind === 'deliver')
)
const rewardItems = computed(() =>
    props.prompt.rewardItems.map(({ itemId, quantity }) => ({ itemId, quantity: quantity ?? 1 }))
)
const confirmLabel = computed(() => {
    if (pending.value) return tGame('game.quests.checking')
    if (props.prompt.action !== 'report') return tGame('game.quests.turnIn')
    return requiredItems.value.length
        ? tGame('game.quests.submitTrophy')
        : tGame('game.quests.repeatVerification')
})
watch(
    () => props.prompt.id,
    () => {
        pending.value = false
        rewardMode.value = props.prompt.rewardMode
    }
)
function answer(accept: boolean): void {
    if (pending.value || (accept && expired.value)) return
    pending.value = true
    emit('command', {
        type: 'quest_turn_in_confirm',
        confirmationId: props.prompt.id,
        accept,
        ...(accept && props.prompt.preAcceptance ? { rewardMode: rewardMode.value } : {}),
    })
}
</script>
<template>
    <SocialWindow
        :title="tGame('game.quests.turnInQuest')"
        modal
        layout="quest"
        @close="answer(false)"
    >
        <QuestTurnInPanel
            v-model:reward-mode="rewardMode"
            :choose-reward-mode="prompt.preAcceptance && prompt.rewardGold > 0"
            :confirm-label="confirmLabel"
            :confirm-disabled="pending || expired"
            :cancel-disabled="pending"
            @confirm="answer(true)"
            @cancel="answer(false)"
        >
            <p>
                {{ tGame('game.quests.questGiver') }}
                <strong>{{ characterName(prompt.issuerId, prompt.issuerName) }}</strong>
            </p>
            <h3>{{ tLocalized(prompt.titleMessage, prompt.title) }}</h3>
            <p>{{ tLocalized(prompt.descriptionMessage, prompt.description) }}</p>
            <ol v-if="objectives.length" class="turn-in-objectives" role="list">
                <li v-for="(label, index) in objectives" :key="index">{{ label }}</li>
            </ol>
            <QuestItemList :items="requiredItems" />
            <p v-if="prompt.action === 'report'" class="social-muted">
                {{ tGame('game.quests.rewardIsPaidAfterWorker') }}
            </p>
            <QuestRewardSummary
                :total="prompt.rewardGold"
                :mode="prompt.preAcceptance ? undefined : prompt.rewardMode"
            />
            <QuestItemList :items="rewardItems" kind="reward" :show-heading="false" />
            <p v-if="expired" class="social-status" role="status">
                {{ tGame('game.quests.confirmationExpiredAskQuestGiver') }}
            </p>
        </QuestTurnInPanel>
        <template v-if="conversation?.partnerId === prompt.issuerId" #below>
            <PrivateConversation
                :conversation="conversation"
                :player-id="playerId"
                @command="emit('command', $event)"
            />
        </template>
    </SocialWindow>
</template>
<style scoped>
.turn-in-objectives {
    list-style: none;
    padding: 0;
}
.turn-in-objectives li {
    margin: 8px 0;
}
</style>

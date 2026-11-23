<script setup lang="ts">
import type { ClientMessage, QuestTurnInPromptSnapshot } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { QuestTurnInPanel } from '@/entities/quests'
import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'
import QuestRewardSummary from './QuestRewardSummary.vue'
import { questObjectiveText } from './questTermsText'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ prompt: QuestTurnInPromptSnapshot; serverTime: number }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const pending = ref(false)
const expired = computed(() => props.serverTime >= props.prompt.expiresAt)
const objectives = computed(() =>
    Array.from(
        { length: Math.max(props.prompt.objectiveLabels.length, props.prompt.objectives.length) },
        (_, index) => ({
            label: questObjectiveText(props.prompt, index, props.prompt.objectives[index]),
            objective: props.prompt.objectives[index],
        })
    )
)
const confirmLabel = computed(() => {
    if (pending.value) return tGame('game.quests.checking')
    return props.prompt.action === 'report'
        ? tGame('game.quests.submitTrophy')
        : tGame('game.quests.turnIn')
})
watch(
    () => props.prompt.id,
    () => {
        pending.value = false
    }
)
function answer(accept: boolean): void {
    if (pending.value || (accept && expired.value)) return
    pending.value = true
    emit('command', { type: 'quest_turn_in_confirm', confirmationId: props.prompt.id, accept })
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
            <ol v-if="objectives.length" class="turn-in-items">
                <li v-for="({ objective, label }, index) in objectives" :key="index">
                    <ItemIcon v-if="objective?.kind === 'deliver'" :item="objective" />
                    <span>{{ label }}</span>
                </li>
            </ol>
            <p v-if="prompt.action === 'report'" class="social-muted">
                {{ tGame('game.quests.rewardIsPaidAfterWorker') }}
            </p>
            <QuestRewardSummary :total="prompt.rewardGold" :mode="prompt.rewardMode" />
            <ul v-if="prompt.rewardItems.length" class="turn-in-items">
                <li v-for="item in prompt.rewardItems" :key="item.instanceId">
                    <ItemIcon :item="item" /><span
                        >{{ itemStackLabel(item) }}
                        {{ tGame('game.quests.whoeverTurnsItIn') }}</span
                    >
                </li>
            </ul>
            <p v-if="expired" class="social-status" role="status">
                {{ tGame('game.quests.confirmationExpiredAskQuestGiver') }}
            </p>
        </QuestTurnInPanel>
    </SocialWindow>
</template>
<style scoped>
.turn-in-items {
    list-style: none;
    padding: 0;
}
.turn-in-items li {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
}
</style>

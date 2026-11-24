<script setup lang="ts">
import { DEFAULT_QUEST_REWARD_MODE, type QuestRewardMode } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import QuestDecisionPanel from './QuestDecisionPanel.vue'
import type { QuestDecisionProps } from './questDecisionProps'
import QuestRewardChoice from './QuestRewardChoice.vue'

const { chooseRewardMode, ...props } = defineProps<
    Partial<QuestDecisionProps> & { chooseRewardMode?: boolean }
>()
const rewardMode = defineModel<QuestRewardMode>('rewardMode', {
    default: DEFAULT_QUEST_REWARD_MODE,
})
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
    <QuestDecisionPanel
        v-bind="props"
        :heading="props.heading ?? tGame('game.quests.turnInQuest')"
        :confirm-label="props.confirmLabel ?? tGame('game.quests.turnIn')"
        :cancel-label="props.cancelLabel ?? tGame('game.quests.backConversation')"
        @confirm="emit('confirm')"
        @cancel="emit('cancel')"
    >
        <slot />
        <QuestRewardChoice
            v-if="chooseRewardMode"
            v-model="rewardMode"
            :disabled="confirmDisabled"
            choose-on-turn-in
        />
    </QuestDecisionPanel>
</template>

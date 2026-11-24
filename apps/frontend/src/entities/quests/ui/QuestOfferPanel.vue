<script setup lang="ts">
import { DEFAULT_QUEST_REWARD_MODE, type QuestRewardMode } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import QuestDecisionPanel from './QuestDecisionPanel.vue'
import type { QuestDecisionProps } from './questDecisionProps'
import QuestItemList from './QuestItemList.vue'
import type { QuestItem } from './questItemListProps'
import QuestRewardChoice from './QuestRewardChoice.vue'

const props = defineProps<
    Partial<QuestDecisionProps> & {
        requiredItems?: readonly QuestItem[]
        rewardGold?: number
        rewardItems?: readonly QuestItem[]
        rewardFromCity?: boolean
    }
>()
const hasGoldReward = computed(() => (props.rewardGold ?? 0) > 0)
defineSlots<{ default?: () => unknown; status?: () => unknown }>()
const rewardMode = defineModel<QuestRewardMode>('rewardMode', {
    default: DEFAULT_QUEST_REWARD_MODE,
})
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
    <QuestDecisionPanel
        :heading="heading ?? tGame('game.quests.questOffer')"
        :confirm-label="confirmLabel ?? tGame('game.quests.takeQuest')"
        :cancel-label="cancelLabel ?? tGame('game.quests.refuseQuest')"
        :confirm-disabled="confirmDisabled"
        :cancel-disabled="cancelDisabled"
        @confirm="emit('confirm')"
        @cancel="emit('cancel')"
    >
        <slot />
        <QuestItemList v-if="requiredItems" :items="requiredItems" />
        <p v-if="hasGoldReward" class="quest-offer__gold">
            <strong>
                {{ tGame('game.quests.totalReward') }} {{ rewardGold }}
                {{ tGame('game.conversation.gold') }} </strong
            >{{ rewardFromCity ? tGame('game.quests.fromCityFund') : '' }}
        </p>
        <p v-else-if="rewardGold === 0 && !rewardItems?.length">
            {{ tGame('game.quests.unpaidRequest') }}
        </p>
        <QuestItemList
            v-if="rewardItems"
            :items="rewardItems"
            kind="reward"
            :show-heading="!hasGoldReward"
        />
        <QuestRewardChoice v-if="hasGoldReward" v-model="rewardMode" />
        <slot name="status" />
    </QuestDecisionPanel>
</template>

<style scoped>
.quest-offer__gold {
    color: var(--quest-panel-title);
}
</style>

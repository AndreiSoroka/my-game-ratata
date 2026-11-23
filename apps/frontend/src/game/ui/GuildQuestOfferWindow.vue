<script setup lang="ts">
import {
    DEFAULT_QUEST_REWARD_MODE,
    type GuildQuestDefinition,
    type QuestRewardMode,
} from '@my-game-ratata/contracts'
import { ref } from 'vue'

import { QuestOfferPanel } from '@/entities/quests'
import { tGame, tLocalized } from '@/shared/lib/i18n'

import QuestRewardChoice from './QuestRewardChoice.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

defineProps<{ job: GuildQuestDefinition; issuerName: string }>()
const emit = defineEmits<{ confirm: [rewardMode: QuestRewardMode]; cancel: [] }>()
const rewardMode = ref<QuestRewardMode>(DEFAULT_QUEST_REWARD_MODE)
</script>

<template>
    <SocialWindow
        :title="tGame('game.quests.questOffer')"
        modal
        layout="quest"
        @close="emit('cancel')"
    >
        <QuestOfferPanel @confirm="emit('confirm', rewardMode)" @cancel="emit('cancel')">
            <p>
                {{ tGame('game.quests.questGiver') }} <strong>{{ issuerName }}</strong>
            </p>
            <h3>{{ tLocalized(job.titleMessage, job.title) }}</h3>
            <p>{{ tLocalized(job.descriptionMessage, job.description) }}</p>
            <QuestRewardSummary :total="job.rewardGold" />
            <QuestRewardChoice v-if="job.rewardGold > 0" v-model="rewardMode" appearance="light" />
        </QuestOfferPanel>
    </SocialWindow>
</template>

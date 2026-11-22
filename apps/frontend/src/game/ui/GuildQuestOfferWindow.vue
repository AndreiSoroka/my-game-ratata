<script setup lang="ts">
import {
    DEFAULT_QUEST_REWARD_MODE,
    type GuildQuestDefinition,
    type QuestRewardMode,
} from '@my-game-ratata/contracts'
import { ref } from 'vue'

import { QuestOfferPanel } from '@/entities/quests'

import QuestRewardChoice from './QuestRewardChoice.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

defineProps<{ job: GuildQuestDefinition; issuerName: string }>()
const emit = defineEmits<{ confirm: [rewardMode: QuestRewardMode]; cancel: [] }>()
const rewardMode = ref<QuestRewardMode>(DEFAULT_QUEST_REWARD_MODE)
</script>

<template>
    <SocialWindow title="Предложение поручения" modal layout="quest" @close="emit('cancel')">
        <QuestOfferPanel @confirm="emit('confirm', rewardMode)" @cancel="emit('cancel')">
            <p>
                Заказчик: <strong>{{ issuerName }}</strong>
            </p>
            <h3>{{ job.title }}</h3>
            <p>{{ job.description }}</p>
            <QuestRewardSummary :total="job.rewardGold" />
            <QuestRewardChoice v-if="job.rewardGold > 0" v-model="rewardMode" appearance="light" />
        </QuestOfferPanel>
    </SocialWindow>
</template>

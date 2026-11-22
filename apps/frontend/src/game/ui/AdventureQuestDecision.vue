<script setup lang="ts">
import type { AdventureQuestSnapshot, QuestRewardMode } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { QuestOfferPanel, QuestTurnInPanel } from '@/entities/quests'

import QuestRewardChoice from './QuestRewardChoice.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ quest: AdventureQuestSnapshot; issuer: string; offer: boolean }>()
const rewardMode = defineModel<QuestRewardMode>({ required: true })
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const title = computed(() => (props.offer ? 'Предложение поручения' : 'Сдать поручение'))
</script>

<template>
    <SocialWindow :title="title" modal layout="quest" @close="emit('cancel')">
        <component
            :is="offer ? QuestOfferPanel : QuestTurnInPanel"
            :heading="title"
            @confirm="emit('confirm')"
            @cancel="emit('cancel')"
        >
            <h3>{{ quest.title }}</h3>
            <p>{{ quest.description }}</p>
            <p>
                Заказчик: <strong>{{ issuer }}</strong>
            </p>
            <QuestRewardSummary
                :total="quest.rewardGold"
                :mode="offer ? undefined : quest.rewardMode"
            />
            <QuestRewardChoice
                v-if="offer && quest.rewardGold > 0"
                v-model="rewardMode"
                appearance="light"
            />
        </component>
    </SocialWindow>
</template>

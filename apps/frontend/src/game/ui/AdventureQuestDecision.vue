<script setup lang="ts">
import type { AdventureQuestSnapshot, QuestRewardMode } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { QuestOfferPanel, QuestTurnInPanel } from '@/entities/quests'
import { tGame, tLocalized } from '@/shared/lib/i18n'

import QuestRewardChoice from './QuestRewardChoice.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ quest: AdventureQuestSnapshot; issuer: string; offer: boolean }>()
const rewardMode = defineModel<QuestRewardMode>({ required: true })
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const title = computed(() =>
    props.offer ? tGame('game.quests.questOffer') : tGame('game.quests.turnInQuest')
)
</script>

<template>
    <SocialWindow :title="title" modal layout="quest" @close="emit('cancel')">
        <component
            :is="offer ? QuestOfferPanel : QuestTurnInPanel"
            :heading="title"
            @confirm="emit('confirm')"
            @cancel="emit('cancel')"
        >
            <h3>{{ tLocalized(quest.titleMessage, quest.title) }}</h3>
            <p>{{ tLocalized(quest.descriptionMessage, quest.description) }}</p>
            <p>
                {{ tGame('game.quests.questGiver') }} <strong>{{ issuer }}</strong>
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

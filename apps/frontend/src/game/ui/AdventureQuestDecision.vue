<script setup lang="ts">
import type { AdventureQuestSnapshot, QuestRewardMode } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { QuestItemList, QuestOfferPanel, QuestTurnInPanel } from '@/entities/quests'
import { tGame, tLocalized } from '@/shared/lib/i18n'

import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ quest: AdventureQuestSnapshot; issuer: string; offer: boolean }>()
const rewardMode = defineModel<QuestRewardMode>({ required: true })
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const title = computed(() =>
    props.offer ? tGame('game.quests.questOffer') : tGame('game.quests.turnInQuest')
)
const requiredItems = computed(() =>
    props.quest.requiredItemId
        ? [{ itemId: props.quest.requiredItemId, quantity: props.quest.goal }]
        : []
)
</script>

<template>
    <SocialWindow :title="title" modal layout="quest" @close="emit('cancel')">
        <component
            :is="offer ? QuestOfferPanel : QuestTurnInPanel"
            :heading="title"
            v-bind="offer ? { requiredItems, rewardGold: quest.rewardGold, rewardMode } : {}"
            @confirm="emit('confirm')"
            @cancel="emit('cancel')"
            @update:reward-mode="rewardMode = $event"
        >
            <h3>{{ tLocalized(quest.titleMessage, quest.title) }}</h3>
            <p>{{ tLocalized(quest.descriptionMessage, quest.description) }}</p>
            <p>
                {{ tGame('game.quests.questGiver') }} <strong>{{ issuer }}</strong>
            </p>
            <template v-if="!offer">
                <QuestItemList :items="requiredItems" />
                <QuestRewardSummary :total="quest.rewardGold" :mode="quest.rewardMode" />
            </template>
        </component>
    </SocialWindow>
</template>

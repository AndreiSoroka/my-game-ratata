<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    QuestOfferSnapshot,
    QuestRewardMode,
} from '@my-game-ratata/contracts'
import { ref } from 'vue'

import QuestTerms from './QuestTerms.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{
    offer: QuestOfferSnapshot
    characters: CharacterSnapshot[]
    serverTime: number
    occupied: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const rewardMode = ref<QuestRewardMode>(props.offer.rewardMode)
function answer(accept: boolean): void {
    emit('command', {
        type: 'quest_offer_answer',
        offerId: props.offer.id,
        revision: props.offer.revision,
        accept,
        rewardMode: rewardMode.value,
    })
}
</script>
<template>
    <SocialWindow title="Предложение поручения" modal @close="answer(false)">
        <QuestTerms :offer="offer" :characters="characters" />
        <label v-if="offer.rewardGold > 0"
            >Распределение золота
            <select v-model="rewardMode" aria-label="Распределение награды">
                <option value="submitter">Сдающему</option>
                <option value="party_equal">Поровну текущему отряду при сдаче</option>
            </select>
        </label>
        <p class="social-muted">
            Режим фиксируется при принятии. Одновременно можно выполнять один договор.
        </p>
        <p v-if="occupied" class="social-status">Сначала завершите или отмените текущий договор.</p>
        <p v-if="serverTime >= offer.expiresAt" class="social-status">Предложение устарело.</p>
        <div class="social-window__actions">
            <button
                type="button"
                :disabled="occupied || serverTime >= offer.expiresAt"
                @click="answer(true)"
            >
                Взять
            </button>
            <button type="button" @click="answer(false)">Отказаться</button>
        </div>
    </SocialWindow>
</template>

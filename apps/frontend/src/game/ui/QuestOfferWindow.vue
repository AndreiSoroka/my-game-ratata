<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    QuestOfferSnapshot,
    QuestRewardMode,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import { ref, watch } from 'vue'

import PrivateConversation from './PrivateConversation.vue'
import QuestRewardChoice from './QuestRewardChoice.vue'
import QuestTerms from './QuestTerms.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{
    offer: QuestOfferSnapshot
    characters: CharacterSnapshot[]
    serverTime: number
    occupied: boolean
    playerId?: string
    conversation?: WhisperSnapshot | null
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const rewardMode = ref<QuestRewardMode>(props.offer.rewardMode)
const initialRevision = ref(props.offer.revision)
watch(
    () => props.offer.id,
    () => {
        rewardMode.value = props.offer.rewardMode
        initialRevision.value = props.offer.revision
    }
)
function whisper(text: string): void {
    emit('command', { type: 'whisper', targetId: props.offer.issuerId, text })
}
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
        <p v-if="offer.introduction" class="quest-offer__introduction">{{ offer.introduction }}</p>
        <QuestTerms :offer="offer" :characters="characters" />
        <p v-if="offer.revision !== initialRevision" class="social-status" role="status">
            Заказчик изменил награду. Проверьте текущие условия перед принятием.
        </p>
        <QuestRewardChoice v-if="offer.rewardGold > 0" v-model="rewardMode" />
        <p class="social-muted">
            Режим фиксируется при принятии. Одновременно можно выполнять один договор.
        </p>
        <p v-if="occupied" class="social-status">Сначала завершите или отмените текущий договор.</p>
        <p v-if="serverTime >= offer.expiresAt" class="social-status">Предложение устарело.</p>
        <PrivateConversation
            v-if="conversation?.partnerId === offer.issuerId"
            :conversation="conversation"
            :player-id="playerId ?? ''"
            @send="whisper"
            @command="emit('command', $event)"
        />
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

<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    QuestOfferSnapshot,
    QuestRewardMode,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { QuestOfferPanel } from '@/entities/quests'
import { tGame } from '@/shared/lib/i18n'

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
const expired = computed(() => props.serverTime >= props.offer.expiresAt)
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
    if (accept && (props.occupied || expired.value)) return
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
    <SocialWindow
        :title="tGame('game.quests.questOffer')"
        modal
        layout="quest"
        @close="answer(false)"
    >
        <QuestOfferPanel
            :confirm-disabled="occupied || expired"
            @confirm="answer(true)"
            @cancel="answer(false)"
        >
            <p v-if="offer.introduction" class="quest-offer__introduction">
                {{ offer.introduction }}
            </p>
            <QuestTerms :offer="offer" :characters="characters" />
            <p v-if="offer.revision !== initialRevision" class="social-status" role="status">
                {{ tGame('game.quests.questGiverChangedRewardReview') }}
            </p>
            <QuestRewardChoice
                v-if="offer.rewardGold > 0"
                v-model="rewardMode"
                appearance="light"
            />
            <p class="social-muted">{{ tGame('game.quests.youCanHaveOneActive') }}</p>
            <p v-if="occupied" class="social-status" role="status">
                {{ tGame('game.quests.completeOrCancelYourCurrent') }}
            </p>
            <p v-if="expired" class="social-status" role="status">
                {{ tGame('game.quests.offerExpired') }}
            </p>
            <PrivateConversation
                v-if="conversation?.partnerId === offer.issuerId"
                :conversation="conversation"
                :player-id="playerId ?? ''"
                @send="whisper"
                @command="emit('command', $event)"
            />
        </QuestOfferPanel>
    </SocialWindow>
</template>

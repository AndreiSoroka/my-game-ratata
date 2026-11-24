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
const usesGroupSlot = computed(() => props.offer.authoredQuestId !== 'hearts-for-the-border-bell')
const groupOccupied = computed(() => usesGroupSlot.value && props.occupied)
const cityFunded = computed(
    () =>
        props.offer.guildQuestId === undefined &&
        (props.offer.funding === 'city' || props.offer.funding === 'worker')
)
const expired = computed(() => props.serverTime >= props.offer.expiresAt)
const requiredItems = computed(() =>
    props.offer.objectives.filter((objective) => objective.kind === 'deliver')
)
const rewardItems = computed(() =>
    props.offer.rewardItems.map(({ itemId, quantity }) => ({ itemId, quantity: quantity ?? 1 }))
)
watch(
    () => props.offer.id,
    () => {
        rewardMode.value = props.offer.rewardMode
        initialRevision.value = props.offer.revision
    }
)
function answer(accept: boolean): void {
    if (accept && (groupOccupied.value || expired.value)) return
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
            v-model:reward-mode="rewardMode"
            :confirm-disabled="groupOccupied || expired"
            :required-items="requiredItems"
            :reward-gold="offer.rewardGold"
            :reward-items="rewardItems"
            :reward-from-city="cityFunded"
            @confirm="answer(true)"
            @cancel="answer(false)"
        >
            <p v-if="offer.introduction" class="quest-offer__introduction">
                {{ offer.introduction }}
            </p>
            <QuestTerms :offer="offer" :characters="characters" details-only />
            <template #status>
                <p v-if="offer.revision !== initialRevision" class="social-status" role="status">
                    {{ tGame('game.quests.questGiverChangedRewardReview') }}
                </p>
                <p v-if="usesGroupSlot" class="social-muted">
                    {{ tGame('game.quests.youCanHaveOneActive') }}
                </p>
                <p v-if="groupOccupied" class="social-status" role="status">
                    {{ tGame('game.quests.completeOrCancelYourCurrent') }}
                </p>
                <p v-if="expired" class="social-status" role="status">
                    {{ tGame('game.quests.offerExpired') }}
                </p>
            </template>
        </QuestOfferPanel>
        <template v-if="conversation?.partnerId === offer.issuerId" #below>
            <PrivateConversation
                :conversation="conversation"
                :player-id="playerId ?? ''"
                @command="emit('command', $event)"
            />
        </template>
    </SocialWindow>
</template>

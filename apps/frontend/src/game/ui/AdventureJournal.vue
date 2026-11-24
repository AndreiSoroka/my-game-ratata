<script setup lang="ts">
import type {
    AdventureQuestStatus,
    AdventureSnapshot,
    ClientMessage,
    PartySnapshot,
} from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

import { GuildQuestCard, QuestRewardSummary } from '@/entities/quests'
import { craftOrderPaymentText, craftOrderStatusLabels } from '@/entities/shops'
import { itemName, tGame, tLocalized } from '@/shared/lib/i18n'

import { itemAssetCatalog } from '../assets/itemCatalog'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
const props = defineProps<{
    adventure: AdventureSnapshot
    party?: PartySnapshot
    playerId?: string
    alive?: boolean
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const progressId = useId()
const heart = computed(
    () => itemAssetCatalog[props.adventure.quest.requiredItemId ?? 'slime_heart']
)
const completed = computed(() => props.adventure.quest.status === 'completed')
const cancelled = computed(() => props.adventure.quest.status === 'cancelled')
const terminal = computed(() => completed.value || cancelled.value)
const canAbandon = computed(
    () =>
        props.alive &&
        props.party &&
        (!props.party.leaderId || props.party.leaderId === props.playerId)
)
const statuses: Record<AdventureQuestStatus, string> = {
    get active() {
        return tGame('game.quests.collectHearts')
    },
    get available() {
        return tGame('game.quests.newStory')
    },
    get completed() {
        return tGame('game.quests.heartsHandedIn')
    },
    get cancelled() {
        return tGame('game.quests.cityOrderClosed')
    },
    get ready() {
        return tGame('game.quests.heartsCollected')
    },
}
</script>
<template>
    <section
        class="adventure-journal adventure-window game-frame-host"
        :aria-label="tGame('game.quests.questJournal')"
    >
        <GameFrame variant="window" />
        <header class="adventure-window__header">
            <span>{{ tGame('game.quests.adventurersJournal') }}</span>
            <GameButton icon :aria-label="tGame('game.quests.closeJournal')" @click="emit('close')"
                >×</GameButton
            >
        </header>
        <p class="adventure-eyebrow">
            {{
                adventure.wardRestored
                    ? tGame('game.quests.cityAwakened')
                    : statuses[adventure.quest.status]
            }}
        </p>
        <h2>{{ tLocalized(adventure.quest.titleMessage, adventure.quest.title) }}</h2>
        <p>{{ tLocalized(adventure.quest.descriptionMessage, adventure.quest.description) }}</p>
        <div v-if="!cancelled" class="journal-hearts">
            <img
                :src="heart.src"
                :alt="itemName(adventure.quest.requiredItemId ?? 'slime_heart')"
            />
            <label :for="completed ? undefined : progressId"
                >{{ tGame('game.quests.slimeHeartsInYourBackpack') }}
                <strong
                    >{{ adventure.trophies
                    }}<template v-if="!completed"> / {{ adventure.quest.goal }}</template></strong
                >
            </label>
        </div>
        <progress
            v-if="!terminal"
            :id="progressId"
            class="journal-progress"
            :value="adventure.trophies"
            :max="adventure.quest.goal"
        />
        <p v-if="!terminal" class="adventure-subtle">
            {{ tGame('game.quests.bellHeartDeliveryHelp') }}
        </p>
        <p v-else-if="completed" class="adventure-success">
            {{ tGame('game.quests.miraReceived') }} {{ adventure.quest.goal }}
            {{ tGame('game.quests.heartsRewardDelivered') }}
        </p>
        <p v-else class="adventure-subtle">
            {{ tLocalized(adventure.quest.noticeMessage, adventure.quest.notice ?? '') }}
        </p>
        <p v-if="adventure.wardRestored" class="adventure-success">
            {{ tGame('game.quests.bellMemoryHasAwakenedCitys') }}
        </p>
        <p
            v-else-if="adventure.cityState?.bellState === 'prepared' || completed"
            class="adventure-subtle"
        >
            {{ tGame('game.quests.bellIsReadyEnterChapel') }}
        </p>
        <QuestRewardSummary
            v-if="!cancelled"
            :total="adventure.quest.rewardGold"
            :mode="adventure.quest.rewardMode"
            :shares="adventure.quest.rewardShares"
            :player-id="playerId"
            :completed="completed"
        />
        <GuildQuestCard
            v-if="party?.activeJob"
            :job="party.activeJob"
            :player-id="playerId"
            :can-abandon="Boolean(canAbandon)"
            @abandon="emit('command', { type: 'guild_abandon', instanceId: $event })"
        />
        <section
            v-if="adventure.craftOrders?.length"
            :aria-label="tGame('game.quests.workshopOrders')"
        >
            <h3>{{ tGame('game.quests.workshopOrders') }}</h3>
            <p v-for="order in adventure.craftOrders" :key="order.id">
                <strong>{{ order.label }} — {{ craftOrderStatusLabels[order.status] }}</strong
                ><br />
                <small>{{ craftOrderPaymentText(order) }}</small>
            </p>
        </section>
    </section>
</template>
<style scoped>
.journal-hearts {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    font:
        13px/1.5 system-ui,
        sans-serif;
}
.journal-hearts img {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    flex: none;
}
.journal-hearts strong {
    white-space: nowrap;
    color: #f3d594;
}
.journal-progress {
    width: 100%;
    height: 8px;
    accent-color: #a4c07c;
    margin-top: 8px;
}
</style>

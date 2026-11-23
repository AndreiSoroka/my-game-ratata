<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, NpcQuestSnapshot } from '@my-game-ratata/contracts'

import { tGame, tLocalized } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import QuestTerms from './QuestTerms.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ quest: NpcQuestSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const statusLabels: Record<NpcQuestSnapshot['status'], string> = {
    get active() {
        return tGame('game.quests.inProgress')
    },
    get ready() {
        return tGame('game.quests.readyToTurnIn')
    },
    get completed() {
        return tGame('game.quests.completed')
    },
    get cancelled() {
        return tGame('game.quests.cancelled')
    },
    get reward_missing() {
        return tGame('game.quests.rewardMissing')
    },
}
function turnIn(): void {
    emit('command', { type: 'npc_quest_turn_in', instanceId: props.quest.instanceId })
}
</script>
<template>
    <SocialWindow :title="tGame('game.quests.yourContract')" @close="emit('close')">
        <QuestTerms :offer="quest" :characters="characters" :progress="quest.progress" />
        <p class="social-status">{{ statusLabels[quest.status] }}</p>
        <p>
            {{ tGame('game.character.gold') }}
            {{
                quest.rewardMode === 'party_equal'
                    ? tGame('game.quests.splitAtTurnIn')
                    : tGame('game.quests.forSubmitter')
            }}.
        </p>
        <p v-if="quest.notice" role="status">{{ tLocalized(quest.noticeMessage, quest.notice) }}</p>
        <div
            class="social-window__actions"
            v-if="['active', 'ready', 'reward_missing'].includes(quest.status)"
        >
            <GameButton variant="success" :disabled="quest.status !== 'ready'" @click="turnIn">
                {{ tGame('game.quests.turnInQuestGiver') }}
            </GameButton>
            <GameButton
                variant="danger"
                @click="
                    emit('command', { type: 'npc_quest_abandon', instanceId: quest.instanceId })
                "
            >
                {{ tGame('game.character.cancelContract') }}
            </GameButton>
        </div>
    </SocialWindow>
</template>

<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, NpcQuestSnapshot } from '@my-game-ratata/contracts'

import QuestTerms from './QuestTerms.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ quest: NpcQuestSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const statusLabels: Record<NpcQuestSnapshot['status'], string> = {
    active: 'Выполняется',
    ready: 'Готово к сдаче',
    completed: 'Завершено',
    cancelled: 'Отменено',
    reward_missing: 'Обещанная награда недоступна',
}
function turnIn(): void {
    emit('command', { type: 'npc_quest_turn_in', instanceId: props.quest.instanceId })
}
</script>
<template>
    <SocialWindow title="Ваш договор" @close="emit('close')">
        <QuestTerms :offer="quest" :characters="characters" :progress="quest.progress" />
        <p class="social-status">{{ statusLabels[quest.status] }}</p>
        <p>
            Золото:
            {{
                quest.rewardMode === 'party_equal'
                    ? 'поровну текущему отряду при сдаче'
                    : 'сдающему'
            }}.
        </p>
        <p v-if="quest.notice" role="status">{{ quest.notice }}</p>
        <div
            class="social-window__actions"
            v-if="['active', 'ready', 'reward_missing'].includes(quest.status)"
        >
            <button type="button" :disabled="quest.status !== 'ready'" @click="turnIn">
                Сдать заказчику
            </button>
            <button
                type="button"
                @click="
                    emit('command', { type: 'npc_quest_abandon', instanceId: quest.instanceId })
                "
            >
                Отменить договор
            </button>
        </div>
    </SocialWindow>
</template>

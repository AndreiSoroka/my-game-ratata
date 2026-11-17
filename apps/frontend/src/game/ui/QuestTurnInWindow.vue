<script setup lang="ts">
import type { ClientMessage, QuestTurnInPromptSnapshot } from '@my-game-ratata/contracts'
import { ref, watch } from 'vue'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'
import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ prompt: QuestTurnInPromptSnapshot; serverTime: number }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const pending = ref(false)
watch(
    () => props.prompt.id,
    () => {
        pending.value = false
    }
)
function answer(accept: boolean): void {
    if (pending.value) return
    pending.value = true
    emit('command', { type: 'quest_turn_in_confirm', confirmationId: props.prompt.id, accept })
}
</script>
<template>
    <SocialWindow title="Сдать поручение" modal @close="answer(false)">
        <p>
            Заказчик: <strong>{{ prompt.issuerName }}</strong>
        </p>
        <h3>{{ prompt.title }}</h3>
        <p>{{ prompt.description }}</p>
        <ol v-if="prompt.objectiveLabels.length">
            <li
                v-for="(label, index) in prompt.objectiveLabels"
                :key="index"
                class="turn-in-objective"
            >
                <ItemIcon
                    v-if="prompt.objectives[index]?.kind === 'deliver'"
                    :item="
                        prompt.objectives[index]! as Extract<
                            (typeof prompt.objectives)[number],
                            { kind: 'deliver' }
                        >
                    "
                />{{ label }}
            </li>
        </ol>
        <p v-if="prompt.action === 'report'" class="social-status">
            Сейчас вы передаёте трофей и начинаете проверочный рейс. Награда будет выдана после
            проверки и возвращения работника.
        </p>
        <QuestRewardSummary :total="prompt.rewardGold" :mode="prompt.rewardMode" />
        <ul v-if="prompt.rewardItems.length" class="turn-in-items">
            <li v-for="item in prompt.rewardItems" :key="item.instanceId">
                <ItemIcon :item="item" />{{ itemStackLabel(item) }} · сдающему
            </li>
        </ul>
        <p v-if="serverTime >= prompt.expiresAt" role="status">
            Подтверждение устарело. Попросите заказчика проверить договор снова.
        </p>
        <div class="social-window__actions">
            <button
                type="button"
                :disabled="pending || serverTime >= prompt.expiresAt"
                @click="answer(true)"
            >
                {{
                    pending
                        ? 'Проверяем…'
                        : prompt.action === 'report'
                          ? 'Передать трофей и доложить'
                          : 'Сдать'
                }}
            </button>
            <button type="button" :disabled="pending" @click="answer(false)">
                Вернуться к разговору
            </button>
        </div>
    </SocialWindow>
</template>
<style scoped>
.turn-in-items {
    list-style: none;
    padding: 0;
}
.turn-in-objective,
.turn-in-items li {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
}
</style>

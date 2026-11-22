<script setup lang="ts">
import type { ClientMessage, QuestTurnInPromptSnapshot } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { QuestTurnInPanel } from '@/entities/quests'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'
import QuestRewardSummary from './QuestRewardSummary.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{ prompt: QuestTurnInPromptSnapshot; serverTime: number }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const pending = ref(false)
const expired = computed(() => props.serverTime >= props.prompt.expiresAt)
const objectives = computed(() =>
    props.prompt.objectiveLabels.map((label, index) => ({
        label,
        objective: props.prompt.objectives[index],
    }))
)
const confirmLabel = computed(() => {
    if (pending.value) return 'Проверяем…'
    return props.prompt.action === 'report' ? 'Передать трофей и доложить' : 'Сдать'
})
watch(
    () => props.prompt.id,
    () => {
        pending.value = false
    }
)
function answer(accept: boolean): void {
    if (pending.value || (accept && expired.value)) return
    pending.value = true
    emit('command', { type: 'quest_turn_in_confirm', confirmationId: props.prompt.id, accept })
}
</script>
<template>
    <SocialWindow title="Сдать поручение" modal layout="quest" @close="answer(false)">
        <QuestTurnInPanel
            :confirm-label="confirmLabel"
            :confirm-disabled="pending || expired"
            :cancel-disabled="pending"
            @confirm="answer(true)"
            @cancel="answer(false)"
        >
            <p>
                Заказчик: <strong>{{ prompt.issuerName }}</strong>
            </p>
            <h3>{{ prompt.title }}</h3>
            <p>{{ prompt.description }}</p>
            <ol v-if="objectives.length" class="turn-in-items">
                <li v-for="({ objective, label }, index) in objectives" :key="index">
                    <ItemIcon v-if="objective?.kind === 'deliver'" :item="objective" />
                    <span>{{ label }}</span>
                </li>
            </ol>
            <p v-if="prompt.action === 'report'" class="social-muted">
                Награду выдадут после проверочного рейса и возвращения работника.
            </p>
            <QuestRewardSummary :total="prompt.rewardGold" :mode="prompt.rewardMode" />
            <ul v-if="prompt.rewardItems.length" class="turn-in-items">
                <li v-for="item in prompt.rewardItems" :key="item.instanceId">
                    <ItemIcon :item="item" /><span>{{ itemStackLabel(item) }} · сдающему</span>
                </li>
            </ul>
            <p v-if="expired" class="social-status" role="status">
                Подтверждение устарело. Попросите заказчика проверить договор снова.
            </p>
        </QuestTurnInPanel>
    </SocialWindow>
</template>
<style scoped>
.turn-in-items {
    list-style: none;
    padding: 0;
}
.turn-in-items li {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
}
</style>

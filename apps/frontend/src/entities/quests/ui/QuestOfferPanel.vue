<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'

import QuestDecisionPanel from './QuestDecisionPanel.vue'
import type { QuestDecisionProps } from './questDecisionProps'

const props = defineProps<Partial<QuestDecisionProps>>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
    <QuestDecisionPanel
        v-bind="props"
        :heading="props.heading ?? tGame('game.quests.questOffer')"
        :confirm-label="props.confirmLabel ?? tGame('game.quests.takeQuest')"
        :cancel-label="props.cancelLabel ?? tGame('game.quests.refuseQuest')"
        @confirm="emit('confirm')"
        @cancel="emit('cancel')"
    >
        <slot />
    </QuestDecisionPanel>
</template>

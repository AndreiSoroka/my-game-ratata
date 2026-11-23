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
        :heading="props.heading ?? tGame('game.quests.turnInQuest')"
        :confirm-label="props.confirmLabel ?? tGame('game.quests.turnIn')"
        :cancel-label="props.cancelLabel ?? tGame('game.quests.backConversation')"
        @confirm="emit('confirm')"
        @cancel="emit('cancel')"
    >
        <slot />
    </QuestDecisionPanel>
</template>

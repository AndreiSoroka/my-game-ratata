<script setup lang="ts">
import QuestDecisionPanel from './QuestDecisionPanel.vue'
import type { QuestDecisionProps } from './questDecisionProps'

const props = withDefaults(defineProps<Partial<QuestDecisionProps>>(), {
    heading: 'Сдать поручение',
    confirmLabel: 'Сдать',
    cancelLabel: 'Вернуться к разговору',
})
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
    <QuestDecisionPanel v-bind="props" @confirm="emit('confirm')" @cancel="emit('cancel')">
        <slot />
    </QuestDecisionPanel>
</template>

<script setup lang="ts">
import QuestDecisionPanel from './QuestDecisionPanel.vue'
import type { QuestDecisionProps } from './questDecisionProps'

const props = withDefaults(defineProps<Partial<QuestDecisionProps>>(), {
    heading: 'Предложение поручения',
    confirmLabel: 'Взять',
    cancelLabel: 'Отказаться',
})
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
    <QuestDecisionPanel v-bind="props" @confirm="emit('confirm')" @cancel="emit('cancel')">
        <slot />
    </QuestDecisionPanel>
</template>

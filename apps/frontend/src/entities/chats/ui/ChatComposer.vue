<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'

import { UiInput, type UiInputHandle } from '@/shared/ui/common'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ maxLength: number; autofocus?: boolean }>()
const draft = defineModel<string>('draft', { required: true })
const input = useTemplateRef<UiInputHandle>('input')

function focusAtEnd(): void {
    const element = input.value?.element
    if (!element) return
    element.focus({ preventScroll: true })
    const end = element.value.length
    element.setSelectionRange(end, end)
}

defineExpose({ focusAtEnd })

onMounted(() => {
    if (props.autofocus) input.value?.focus({ preventScroll: true })
})
</script>

<template>
    <div class="chat-input">
        <UiInput
            ref="input"
            aria-label="Сообщение в чат"
            placeholder="Напишите сообщение…"
            autocomplete="off"
            enterkeyhint="send"
            v-bind="$attrs"
            v-model="draft"
            :focus-ring="false"
            :framed="false"
            :maxlength="maxLength"
        >
            <template #leading><span aria-hidden="true">&gt;</span></template>
            <template #trailing>
                <span class="chat-input__count">{{ draft.length }}/{{ maxLength }}</span>
            </template>
        </UiInput>
    </div>
</template>

<style scoped>
.chat-input {
    min-inline-size: 0;
}

.chat-input__count {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { UiInput, type UiInputHandle } from '@/shared/ui/common'

import type { ChatInputState } from '../runtime/chatInput'

defineProps<{
    state: ChatInputState
}>()
const emit = defineEmits<{ draft: [value: string] }>()
const input = ref<UiInputHandle>()

onMounted(() => input.value?.focus({ preventScroll: true }))
</script>

<template>
    <div class="chat-input" @pointerdown.stop>
        <UiInput
            ref="input"
            :model-value="state.draft"
            :maxlength="state.maxLength"
            aria-label="Сообщение в чат"
            placeholder="Напишите сообщение…"
            autocomplete="off"
            enterkeyhint="send"
            data-public-chat-input
            @update:model-value="emit('draft', $event)"
        >
            <template #leading><span aria-hidden="true">&gt;</span></template>
            <template #trailing>
                <span class="chat-input__count"
                    >{{ state.draft.length }}/{{ state.maxLength }}</span
                >
            </template>
        </UiInput>
    </div>
</template>

<style scoped>
.chat-input {
    min-width: 0;
}

.chat-input__count {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}
</style>

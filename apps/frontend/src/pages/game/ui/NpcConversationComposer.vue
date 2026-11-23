<script setup lang="ts">
import { ref, useId, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiInput } from '@/shared/ui/common'

const props = defineProps<{ targetId: string; waiting: boolean }>()
const emit = defineEmits<{ send: [text: string] }>()
const inputId = useId()
const draft = ref('')
watch(
    () => props.targetId,
    () => (draft.value = '')
)

function submit(): void {
    const text = draft.value.trim()
    if (!text || props.waiting) return
    emit('send', text)
    draft.value = ''
}
</script>

<template>
    <form class="npc-conversation-composer" @submit.prevent="submit">
        <label :for="inputId">{{ tGame('game.conversation.npcReply') }}</label>
        <div class="npc-conversation-composer__row">
            <UiInput
                :id="inputId"
                v-model="draft"
                autocomplete="off"
                maxlength="400"
                data-dialogue-focus
            />
            <UiButton
                type="submit"
                :disabled="waiting || draft.trim().length === 0"
                data-dialogue-focus
            >
                {{ tGame('game.conversation.send') }}
            </UiButton>
        </div>
        <p v-if="waiting" role="status">{{ tGame('game.conversation.npcThinking') }}</p>
    </form>
</template>

<style scoped>
.npc-conversation-composer {
    margin-block: 8px 12px;
}
.npc-conversation-composer label {
    display: block;
    margin-block-end: 4px;
    font:
        0.875rem/1.4 system-ui,
        sans-serif;
}
.npc-conversation-composer__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
}
.npc-conversation-composer p {
    margin: 4px 0 0;
    color: #e3cd9d;
    font:
        0.875rem/1.4 system-ui,
        sans-serif;
}
@media (max-width: 375px) {
    .npc-conversation-composer__row {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>

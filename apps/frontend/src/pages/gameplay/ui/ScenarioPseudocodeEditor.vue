<script setup lang="ts">
import { ref, useId } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiTextarea } from '@/shared/ui/common'

defineProps<{ error: string; changed: boolean }>()
const text = defineModel<string>({ required: true })
const emit = defineEmits<{ apply: []; revert: [] }>()
const textarea = ref<{ focus: () => void }>()
const errorId = useId()
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
    <section class="automation-form scenario-code">
        <label>
            {{ tGame('game.automation.pseudocode') }}
            <UiTextarea
                :border-width="4"
                ref="textarea"
                v-model="text"
                rows="12"
                spellcheck="false"
                :invalid="Boolean(error)"
                :aria-describedby="error ? errorId : undefined"
            />
        </label>
        <p v-if="error" :id="errorId" role="alert" class="automation-error">{{ error }}</p>
        <div class="automation-row">
            <UiButton variant="primary" :disabled="!changed" @click="emit('apply')">
                {{ tGame('game.automation.applyPseudocode') }}
            </UiButton>
            <UiButton :disabled="!changed" @click="emit('revert')">
                {{ tGame('game.automation.pseudocodeRevert') }}
            </UiButton>
        </div>
    </section>
</template>

<style scoped>
.scenario-code :deep(textarea) {
    width: 100%;
    min-width: 0;
    resize: vertical;
    font-family: monospace;
}
</style>

<script setup lang="ts">
import { ref, useId, useTemplateRef, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiInput } from '@/shared/ui/common'

import type { AdminAccessState } from '../model/useWorldAdministration'

const props = defineProps<{ access: AdminAccessState; busy: boolean; error: string }>()
const emit = defineEmits<{ code: [code: string]; open: [] }>()
const code = ref('')
const codeInputId = useId()
const accessPanel = useTemplateRef<HTMLElement>('accessPanel')
function focusAdmin(): void {
    accessPanel.value?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.focus()
}
watch(
    () => props.access,
    (access, previous) => {
        if (access === 'authorized' && previous === 'code') focusAdmin()
    },
    { flush: 'post' }
)
defineExpose({ focusAdmin })
function submitCode(): void {
    if (props.busy || code.value.length !== 4) return
    emit('code', code.value.toUpperCase())
    code.value = ''
}
</script>

<template>
    <div ref="accessPanel" class="admin-access">
        <p v-if="access === 'checking'" role="status">
            {{ tGame('game.worldSettings.localChecking') }}
        </p>
        <p v-else-if="access === 'unavailable'">{{ tGame('game.worldSettings.remoteHttps') }}</p>
        <form v-else-if="access === 'code'" @submit.prevent="submitCode">
            <label :for="codeInputId">{{ tGame('game.worldSettings.terminalCode') }}</label>
            <div class="admin-access__code">
                <UiInput
                    :id="codeInputId"
                    v-model="code"
                    required
                    autocomplete="one-time-code"
                    autocapitalize="characters"
                    :spellcheck="false"
                    :disabled="busy"
                    minlength="4"
                    maxlength="4"
                    pattern="[A-Za-z0-9]{4}"
                />
                <UiButton type="submit" :disabled="busy || code.length !== 4">
                    {{
                        tGame(
                            busy
                                ? 'game.worldSettings.checkingCode'
                                : 'game.worldSettings.checkCode'
                        )
                    }}
                </UiButton>
            </div>
        </form>
        <UiButton v-else :disabled="busy" aria-haspopup="dialog" @click="emit('open')">
            Admin
        </UiButton>
        <p v-if="error" class="admin-access__error" role="alert">{{ error }}</p>
    </div>
</template>

<style scoped>
.admin-access {
    display: grid;
    justify-items: start;
    gap: 8px;
    min-width: 0;
    color: #eef7ee;
    font:
        0.875rem/1.5 system-ui,
        sans-serif;
}
.admin-access label {
    display: block;
    margin-block-end: 4px;
}
.admin-access p {
    margin: 0;
}
.admin-access__code {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.admin-access__code :deep(.ui-input) {
    inline-size: 5.75rem;
}
.admin-access__code :deep(input) {
    text-transform: uppercase;
    text-align: center;
    letter-spacing: 0.12em;
}
.admin-access__error {
    color: #ffb2a6;
}
</style>

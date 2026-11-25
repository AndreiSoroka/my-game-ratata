<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

import { darkPanelButtonColors, UiButton } from '../button'
import UiInput from './UiInput.vue'

const props = withDefaults(
    defineProps<{
        modelValue: number
        label: string
        min: number
        max: number
        decimals?: number
        border?: FantasyBorderVariant | undefined
    }>(),
    { decimals: 0 }
)
const emit = defineEmits<{
    'update:modelValue': [value: number]
    'draft-validity': [valid: boolean]
}>()
const inputId = useId()
const draft = ref(String(props.modelValue))
const step = computed(() => 10 ** -props.decimals)
const stepBase = computed(() => {
    const value = Number(draft.value)
    return draft.value && Number.isFinite(value) ? value : props.modelValue
})
watch(
    () => props.modelValue,
    (value) => {
        if (draft.value && rounded(Number(draft.value)) === value) return
        draft.value = String(value)
        emit('draft-validity', true)
    }
)
function input(event: Event): void {
    const control = event.target as HTMLInputElement
    draft.value = control.value
    const value = Number(draft.value)
    const inRange =
        Boolean(draft.value) && Number.isFinite(value) && value >= props.min && value <= props.max
    emit('draft-validity', inRange && control.validity.valid)
    if (inRange) emit('update:modelValue', rounded(value))
}
function rounded(value: number): number {
    return Number(value.toFixed(props.decimals))
}
function commit(valueToCommit: number): void {
    const value = Math.max(props.min, Math.min(props.max, rounded(valueToCommit)))
    draft.value = String(value)
    emit('draft-validity', true)
    emit('update:modelValue', value)
}
</script>

<template>
    <div class="ui-number-input">
        <label :for="inputId">{{ label }}</label>
        <UiInput
            :id="inputId"
            type="number"
            :value="draft"
            :min="min"
            :max="max"
            :step="step"
            :border="border"
            @input="input"
            @blur="commit(stepBase)"
        >
            <template #trailing>
                <span class="ui-number-input__steps">
                    <UiButton
                        appearance="ghost"
                        size="compact"
                        icon
                        border="border-015"
                        native-border-width
                        :colors="darkPanelButtonColors"
                        :aria-label="tGame('game.menu.decreaseNumber', { label })"
                        :disabled="stepBase <= min"
                        @click="commit(stepBase - step)"
                    >
                        <span aria-hidden="true">▼</span>
                    </UiButton>
                    <UiButton
                        appearance="ghost"
                        size="compact"
                        icon
                        border="border-015"
                        native-border-width
                        :colors="darkPanelButtonColors"
                        :aria-label="tGame('game.menu.increaseNumber', { label })"
                        :disabled="stepBase >= max"
                        @click="commit(stepBase + step)"
                    >
                        <span aria-hidden="true">▲</span>
                    </UiButton>
                </span>
            </template>
        </UiInput>
    </div>
</template>

<style scoped>
.ui-number-input {
    display: grid;
    gap: 4px;
    min-inline-size: 0;
}

.ui-number-input :deep(input[type='number']) {
    appearance: textfield;
    color-scheme: dark;
}

.ui-number-input :deep(input[type='number']::-webkit-inner-spin-button),
.ui-number-input :deep(input[type='number']::-webkit-outer-spin-button) {
    appearance: none;
    margin: 0;
}

.ui-number-input__steps {
    display: inline-flex;
    gap: 1px;
    opacity: 0;
    pointer-events: none;
}

.ui-number-input:focus-within .ui-number-input__steps {
    opacity: 1;
    pointer-events: auto;
}

.ui-number-input__steps .ui-button {
    min-inline-size: 24px;
    font:
        11px/1 system-ui,
        sans-serif;
}

@media (hover: hover) and (pointer: fine) {
    .ui-number-input:hover .ui-number-input__steps {
        opacity: 1;
        pointer-events: auto;
    }
}

@media (pointer: coarse) {
    .ui-number-input__steps .ui-button {
        --ui-button-min-height: 32px;
        min-inline-size: 32px;
    }
}
</style>

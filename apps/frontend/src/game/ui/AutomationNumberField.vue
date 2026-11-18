<script setup lang="ts">
import { ref, watch } from 'vue'

import GameInput from './primitives/GameInput.vue'

const props = defineProps<{ modelValue: number; label: string; min: number; max: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const draft = ref(String(props.modelValue))
watch(
    () => props.modelValue,
    (value) => {
        draft.value = String(value)
    }
)
function input(event: Event): void {
    draft.value = (event.target as HTMLInputElement).value
    const value = Number(draft.value)
    if (draft.value && Number.isFinite(value) && value >= props.min && value <= props.max)
        emit('update:modelValue', Math.round(value))
}
function commit(): void {
    const parsed = draft.value ? Number(draft.value) : props.modelValue
    const value = Number.isFinite(parsed)
        ? Math.max(props.min, Math.min(props.max, Math.round(parsed)))
        : props.modelValue
    draft.value = String(value)
    emit('update:modelValue', value)
}
</script>

<template>
    <label>
        {{ label }}
        <GameInput
            type="number"
            :value="draft"
            :min="min"
            :max="max"
            step="1"
            @input="input"
            @blur="commit"
        />
    </label>
</template>

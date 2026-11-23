<script setup lang="ts">
import { type WorldEmptyMode, worldEmptyModes } from '@my-game-ratata/contracts'
import { ref, useId, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

const props = defineProps<{
    mode?: WorldEmptyMode
    loading: boolean
    saving: boolean
    error: string
}>()
const emit = defineEmits<{ save: [mode: WorldEmptyMode]; close: [] }>()
const draft = ref<WorldEmptyMode>()
const radioGroup = useId()
watch(
    () => props.mode,
    (mode) => (draft.value = mode),
    { immediate: true }
)
function submit(): void {
    if (!props.saving && draft.value && draft.value !== props.mode) emit('save', draft.value)
}
</script>

<template>
    <div class="world-mode-panel">
        <FantasyBorder
            as="div"
            class="world-mode-panel__frame"
            border="border-017"
            aria-hidden="true"
        />
        <header>
            <h2>{{ tGame('game.worldSettings.title') }}</h2>
            <UiButton :aria-label="tGame('game.worldSettings.close')" @click="emit('close')">
                ×
            </UiButton>
        </header>
        <p v-if="loading" role="status">{{ tGame('game.worldSettings.loading') }}</p>
        <p v-if="error" class="world-mode-panel__error" role="alert">{{ error }}</p>
        <form v-if="mode" @submit.prevent="submit">
            <fieldset :disabled="saving">
                <legend>{{ tGame('game.worldSettings.emptyWorld') }}</legend>
                <label v-for="option in worldEmptyModes" :key="option">
                    <input v-model="draft" :name="radioGroup" type="radio" :value="option" />
                    <span>
                        <strong>{{ tGame(`game.worldSettings.${option}`) }}</strong>
                        <small>{{ tGame(`game.worldSettings.${option}Description`) }}</small>
                    </span>
                </label>
            </fieldset>
            <UiButton type="submit" variant="primary" :disabled="saving || draft === mode">
                {{ tGame(saving ? 'game.worldSettings.saving' : 'game.worldSettings.save') }}
            </UiButton>
        </form>
    </div>
</template>

<style scoped>
.world-mode-panel {
    position: relative;
    padding: clamp(16px, 4vw, 24px);
    color: #f2efdf;
    background: #172820;
}
.world-mode-panel__frame {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: #c6b89b;
}
.world-mode-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-block-end: 14px;
}
.world-mode-panel h2 {
    margin: 0;
    font-size: 1.25rem;
}
.world-mode-panel fieldset {
    min-inline-size: 0;
    margin: 0 0 16px;
    padding: 12px 0 0;
    border: 0;
}
.world-mode-panel label {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 10px;
    padding-block: 6px;
}
.world-mode-panel input {
    margin: 3px 0 0;
    accent-color: #e3cd9d;
}
.world-mode-panel small {
    display: block;
    margin-block-start: 4px;
    color: #cbd7cb;
}
.world-mode-panel__error {
    color: #ffb2a6;
}
</style>

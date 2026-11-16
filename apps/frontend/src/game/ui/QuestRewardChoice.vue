<script setup lang="ts">
import type { QuestRewardMode } from '@my-game-ratata/contracts'
import { useId } from 'vue'

const mode = defineModel<QuestRewardMode>({ required: true })
defineProps<{ disabled?: boolean }>()
const name = useId()
const options: Array<{ value: QuestRewardMode; label: string }> = [
    { value: 'party_equal', label: 'Поровну группе' },
    { value: 'submitter', label: 'Вся награда сдающему' },
]

function confirm(event: KeyboardEvent, value: QuestRewardMode): void {
    if (event.code !== 'KeyF') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) mode.value = value
}
</script>

<template>
    <fieldset class="quest-reward-choice" :disabled="disabled">
        <legend>Распределение награды</legend>
        <label v-for="option in options" :key="option.value">
            <input
                v-model="mode"
                type="radio"
                :name="name"
                :value="option.value"
                @keydown="confirm($event, option.value)"
            />
            <span>{{ option.label }}</span>
        </label>
        <small>Выбор фиксируется при принятии задания.</small>
    </fieldset>
</template>

<style scoped>
.quest-reward-choice {
    display: grid;
    gap: 7px;
    min-width: 0;
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid #526049;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.quest-reward-choice legend {
    color: #e9cf8d;
    padding: 0 4px;
}
.quest-reward-choice label {
    display: flex;
    gap: 8px;
    align-items: center;
    cursor: pointer;
}
.quest-reward-choice input {
    margin: 0;
    accent-color: #d3bb7c;
}
.quest-reward-choice small {
    color: #b4c0ac;
}
</style>

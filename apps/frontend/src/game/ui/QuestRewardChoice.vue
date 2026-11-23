<script setup lang="ts">
import type { QuestRewardMode } from '@my-game-ratata/contracts'
import { useId } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import GameFrame from './primitives/GameFrame.vue'
import GameInput from './primitives/GameInput.vue'

const mode = defineModel<QuestRewardMode>({ required: true })
defineProps<{ disabled?: boolean; appearance?: 'light' }>()
const name = useId()
const options: Array<{ value: QuestRewardMode; label: string }> = [
    {
        value: 'party_equal',
        get label() {
            return tGame('game.quests.equalSplit')
        },
    },
    {
        value: 'submitter',
        get label() {
            return tGame('game.quests.allToSubmitter')
        },
    },
]

function confirm(event: KeyboardEvent, value: QuestRewardMode): void {
    if (event.code !== 'KeyF') return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) mode.value = value
}
</script>

<template>
    <fieldset
        class="quest-reward-choice"
        :class="appearance === 'light' ? 'quest-reward-choice--light' : 'game-frame-host'"
        :disabled="disabled"
    >
        <legend>{{ tGame('game.quests.rewardDistribution') }}</legend>
        <GameFrame v-if="appearance !== 'light'" variant="inset" />
        <label
            v-for="option in options"
            :key="option.value"
            class="quest-reward-option"
            :class="{ selected: mode === option.value, 'game-frame-host': appearance !== 'light' }"
        >
            <GameFrame v-if="appearance !== 'light'" variant="inset" />
            <GameInput
                v-model="mode"
                type="radio"
                :name="name"
                :value="option.value"
                :aria-label="option.label"
                @keydown="confirm($event, option.value)"
            />
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle
                    :cx="option.value === 'submitter' ? 12 : 8"
                    cy="7"
                    r="3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                />
                <path
                    :d="
                        option.value === 'submitter'
                            ? 'M6 21v-4a6 6 0 0 1 12 0v4'
                            : 'M2 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M17 12a6 6 0 0 1 5 5v4'
                    "
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                />
            </svg>
            <span>{{
                option.value === 'submitter'
                    ? tGame('game.quests.submitter')
                    : tGame('game.quests.splitAmongParty')
            }}</span>
            <span class="sr-only">{{ option.label }}</span>
        </label>
        <small>{{ tGame('game.quests.youChooseThisWhenYou') }}</small>
    </fieldset>
</template>

<style scoped>
.quest-reward-choice {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid transparent;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.quest-reward-choice legend {
    color: #e9cf8d;
    padding: 0 4px;
}
.quest-reward-option {
    position: relative;
    display: flex;
    flex: 1 1 170px;
    gap: 8px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: 1px solid transparent;
    padding: 10px 12px;
}
.quest-reward-choice input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
}
.quest-reward-choice label.selected {
    border-color: #dfc36f;
    --game-frame-fill: #3c4c30;
}
.quest-reward-choice label:focus-within {
    outline: 2px solid #dfc36f;
    outline-offset: 2px;
}
.quest-reward-choice:disabled label {
    opacity: 0.5;
    cursor: default;
}
.quest-reward-choice small {
    flex-basis: 100%;
    color: #b4c0ac;
}
.quest-reward-choice--light,
.quest-reward-choice--light .quest-reward-option {
    border-color: var(--ui-light-panel-divider);
}
.quest-reward-choice--light legend {
    color: var(--ui-light-panel-title);
}
.quest-reward-choice--light small {
    color: var(--ui-light-panel-muted);
}
.quest-reward-choice--light label.selected {
    border-color: var(--ui-light-border-wood);
    background: var(--ui-light-panel-parchment);
}
.quest-reward-choice--light label:focus-within {
    outline-color: var(--ui-light-button-focus);
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>

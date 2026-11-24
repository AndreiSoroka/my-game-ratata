<script setup lang="ts">
import type { QuestRewardMode } from '@my-game-ratata/contracts'
import { useId } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { FantasyBorder } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'

const mode = defineModel<QuestRewardMode>({ required: true })
defineProps<{ disabled?: boolean; chooseOnTurnIn?: boolean }>()
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
    <fieldset class="quest-reward-choice" :disabled="disabled">
        <legend>{{ tGame('game.quests.rewardDistribution') }}</legend>
        <FantasyBorder
            class="quest-reward-choice__frame"
            border="border-006"
            :color="lightUiColors.border.wood"
        >
            <label
                v-for="option in options"
                :key="option.value"
                class="quest-reward-option"
                :class="{ selected: mode === option.value }"
            >
                <FantasyBorder
                    as="span"
                    class="quest-reward-option__frame"
                    border="border-001"
                    :color="
                        mode === option.value
                            ? lightUiColors.border.wood
                            : lightUiColors.panel.divider
                    "
                >
                    <input
                        v-model="mode"
                        type="radio"
                        :name="name"
                        :value="option.value"
                        :aria-label="option.label"
                        @keydown="confirm($event, option.value)"
                    />
                    <svg
                        class="quest-reward-option__icon"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
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
                </FantasyBorder>
            </label>
            <small>
                {{
                    tGame(
                        chooseOnTurnIn
                            ? 'game.quests.rewardModeConfirmedAtTurnIn'
                            : 'game.quests.youChooseThisWhenYou'
                    )
                }}
            </small>
        </FantasyBorder>
    </fieldset>
</template>

<style scoped>
.quest-reward-choice {
    min-inline-size: 0;
    margin: 12px 0;
    padding: 0;
    border: 0;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.quest-reward-choice legend {
    color: var(--ui-light-panel-title);
    margin-block-end: 4px;
    padding: 0;
}
.quest-reward-choice__frame {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 2px;
}
.quest-reward-option {
    display: flex;
    flex: 1 1 160px;
    min-inline-size: 0;
    cursor: pointer;
}
.quest-reward-option__frame {
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;
    justify-content: center;
    padding: 3px 5px;
    overflow-wrap: anywhere;
}
.quest-reward-option__icon {
    flex: none;
}
.quest-reward-choice input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
}
.quest-reward-option.selected .quest-reward-option__frame {
    background: var(--ui-light-panel-parchment);
}
.quest-reward-choice label:focus-within {
    outline: 2px solid var(--ui-light-button-focus);
    outline-offset: 2px;
}
.quest-reward-choice:disabled label {
    opacity: 0.5;
    cursor: default;
}
.quest-reward-choice small {
    flex-basis: 100%;
    color: var(--ui-light-panel-muted);
}
</style>

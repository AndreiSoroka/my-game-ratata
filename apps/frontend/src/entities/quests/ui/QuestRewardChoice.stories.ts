import type { QuestRewardMode } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import QuestRewardChoice from './QuestRewardChoice.vue'

interface StoryArgs {
    modelValue: QuestRewardMode
    disabled: boolean
    chooseOnTurnIn: boolean
}

const meta = {
    title: 'Entities/quests/QuestRewardChoice',
    args: { modelValue: 'party_equal', disabled: false, chooseOnTurnIn: false },
    argTypes: {
        modelValue: { control: 'inline-radio', options: ['party_equal', 'submitter'] },
        disabled: { control: 'boolean' },
        chooseOnTurnIn: { control: 'boolean' },
    },
    render(args) {
        const host = renderVueStory(
            {
                setup() {
                    const mode = ref(args.modelValue)
                    return () =>
                        h(QuestRewardChoice, {
                            modelValue: mode.value,
                            disabled: args.disabled,
                            chooseOnTurnIn: args.chooseOnTurnIn,
                            'onUpdate:modelValue': (value: QuestRewardMode) => (mode.value = value),
                        })
                },
            },
            {},
            { background: 'var(--ui-light-panel-coffee)' }
        )
        host.style.maxWidth = '480px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Disabled: Story = { args: { disabled: true } }

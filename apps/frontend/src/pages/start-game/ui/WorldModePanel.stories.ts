import { type WorldEmptyMode, worldEmptyModes } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import WorldModePanel from './WorldModePanel.vue'

interface StoryArgs {
    mode?: WorldEmptyMode
    loading: boolean
    saving: boolean
    error: string
}

const meta = {
    title: 'Pages/StartGame/WorldModePanel',
    args: { mode: 'online_ai', loading: false, saving: false, error: '' },
    argTypes: {
        mode: { control: 'select', options: worldEmptyModes },
        loading: { control: 'boolean' },
        saving: { control: 'boolean' },
        error: { control: 'text' },
    },
    render(args) {
        const host = renderVueStory(WorldModePanel, { ...args })
        host.style.maxWidth = '510px'
        return host
    },
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Always: Story = { args: { mode: 'always' } }
export const PausedWhenEmpty: Story = { args: { mode: 'paused_when_empty' } }
export const Saving: Story = { args: { saving: true } }
export const Error: Story = { args: { error: 'Не удалось сохранить режим мира.' } }

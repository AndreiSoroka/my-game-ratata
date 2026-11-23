import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { StartGameStatus } from '../model/useStartGameReadiness'
import StartGameReadiness from './StartGameReadiness.vue'

const meta = {
    title: 'Pages/StartGame/StartGameReadiness',
    args: { status: 'checking' },
    argTypes: {
        status: {
            control: 'select',
            options: ['checking', 'ready', 'ai_unavailable', 'connection_error'],
        },
    },
    render: (args) => renderVueStory(StartGameReadiness, args, { background: '#172820' }),
} satisfies Meta<{ status: StartGameStatus }>
export default meta
type Story = StoryObj<{ status: StartGameStatus }>

export const Default: Story = {}
export const Ready: Story = { args: { status: 'ready' } }
export const AiUnavailable: Story = { args: { status: 'ai_unavailable' } }
export const ConnectionError: Story = { args: { status: 'connection_error' } }

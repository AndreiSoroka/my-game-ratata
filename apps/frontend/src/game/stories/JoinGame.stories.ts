import '../../assets/app.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import JoinGameStory from './JoinGameStory.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/JoinGamePanel' } satisfies Meta
export default meta
type Story = StoryObj

export const Ready: Story = {
    render: () => {
        const host = renderVueStory(JoinGameStory, {})
        host.style.padding = '0'
        return host
    },
}

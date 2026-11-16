import type { Meta, StoryObj } from '@storybook/web-components-vite'

import ConstellationDebug from '../debug/ConstellationDebug.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Debug/Constellation atlas' } satisfies Meta
export default meta
type Story = StoryObj
export const Atlas: Story = {
    render: () => {
        const host = renderVueStory(ConstellationDebug, { syncUrl: false })
        host.style.padding = '0'
        return host
    },
}

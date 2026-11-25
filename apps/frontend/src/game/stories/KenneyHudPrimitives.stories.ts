import type { Meta, StoryObj } from '@storybook/web-components-vite'

import KenneyHudPrimitivesStory from './KenneyHudPrimitivesStory.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/KenneyHudPrimitivesStory' } satisfies Meta
export default meta
type Story = StoryObj

export const Parchment: Story = {
    render: () => renderVueStory(KenneyHudPrimitivesStory, { section: 'parchment' }),
}
export const Identity: Story = {
    render: () => renderVueStory(KenneyHudPrimitivesStory, { section: 'identity' }),
}
export const Resources: Story = {
    render: () => renderVueStory(KenneyHudPrimitivesStory, { section: 'resources' }),
}

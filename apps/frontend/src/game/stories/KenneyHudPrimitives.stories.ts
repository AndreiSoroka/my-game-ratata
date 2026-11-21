import type { Meta, StoryObj } from '@storybook/web-components-vite'

import KenneyHudPrimitivesStory from './KenneyHudPrimitivesStory.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/KenneyHudPrimitivesStory' } satisfies Meta
export default meta
type Story = StoryObj

export const Parchment: Story = {
    render: () => renderVueStory(KenneyHudPrimitivesStory, { section: 'parchment' }),
}
export const Ribbons: Story = {
    render: () => renderVueStory(KenneyHudPrimitivesStory, { section: 'ribbons' }),
}
export const Resources: Story = {
    render: () => renderVueStory(KenneyHudPrimitivesStory, { section: 'resources' }),
}

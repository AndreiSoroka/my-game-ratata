import type { Meta, StoryObj } from '@storybook/web-components-vite'

import GamePrimitivesStory from './GamePrimitivesStory.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/GamePrimitivesStory' } satisfies Meta
export default meta
type Story = StoryObj

export const Buttons: Story = {
    render: () => renderVueStory(GamePrimitivesStory, { section: 'buttons' }),
}
export const Fields: Story = {
    render: () => renderVueStory(GamePrimitivesStory, { section: 'fields' }),
}
export const Frames: Story = {
    render: () => renderVueStory(GamePrimitivesStory, { section: 'frames' }),
}
export const Slots: Story = {
    render: () => renderVueStory(GamePrimitivesStory, { section: 'slots' }),
}

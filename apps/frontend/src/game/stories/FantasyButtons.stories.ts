import type { Meta, StoryObj } from '@storybook/web-components-vite'

import FantasyButtonsStory from './FantasyButtonsStory.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Fantasy buttons' } satisfies Meta
export default meta
type Story = StoryObj

function preview(section: 'menu' | 'variants' | 'sizes' | 'states'): HTMLElement {
    const host = renderVueStory(FantasyButtonsStory, { section })
    host.style.cssText =
        'position:relative;min-height:100dvh;display:grid;place-items:start center;padding:24px;box-sizing:border-box'
    return host
}

export const Menu: Story = { render: () => preview('menu') }
export const Variants: Story = { render: () => preview('variants') }
export const Sizes: Story = { render: () => preview('sizes') }
export const States: Story = { render: () => preview('states') }

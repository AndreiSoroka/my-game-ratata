import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ExchangeConsentIcon from './ExchangeConsentIcon.vue'

interface StoryArgs {
    accepted: boolean
    name: string
}

const meta = {
    title: 'Entities/exchanges/ExchangeConsentIcon',
    args: { accepted: false, name: 'Мира' },
    argTypes: { accepted: { control: 'boolean' }, name: { control: 'text' } },
    render(args) {
        const host = renderVueStory(
            ExchangeConsentIcon,
            { ...args },
            { background: 'var(--ui-dark-panel-surface)', padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.width = 'fit-content'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Accepted: Story = { args: { accepted: true } }

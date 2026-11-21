import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import type { ExchangeInvitationSnapshot } from '@/entities/exchanges'
import { renderVueStory } from '@/shared/lib/storybook'

import ExchangeInvitationWidget from './ExchangeInvitationWidget.vue'

interface StoryArgs {
    exchange: ExchangeInvitationSnapshot | null | undefined
    onAccept: (id: string) => void
    onDecline: (id: string) => void
    onCancel: (id: string) => void
}

const exchange: ExchangeInvitationSnapshot = {
    id: 'exchange-1',
    status: 'invited',
    partnerName: 'Мира',
    incoming: true,
}

const meta = {
    title: 'Widgets/Exchanges/ExchangeInvitationWidget',
    args: {
        exchange,
        onAccept: fn().mockName('accept'),
        onDecline: fn().mockName('decline'),
        onCancel: fn().mockName('cancel'),
    },
    argTypes: {
        exchange: { control: 'object' },
        onAccept: { control: false, table: { disable: true } },
        onDecline: { control: false, table: { disable: true } },
        onCancel: { control: false, table: { disable: true } },
    },
    render(args) {
        const host = renderVueStory(ExchangeInvitationWidget, { ...args })
        host.style.maxWidth = '418px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Outgoing: Story = { args: { exchange: { ...exchange, incoming: false } } }

export const NoInvitation: Story = { args: { exchange: null } }

export const Active: Story = { args: { exchange: { ...exchange, status: 'active' } } }

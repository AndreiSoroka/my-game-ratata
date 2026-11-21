import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import type { ExchangeInvitationDirection } from '../model/exchangeInvitation'
import ExchangeInvitationNotice from './ExchangeInvitationNotice.vue'

interface StoryArgs {
    partnerName: string
    direction: ExchangeInvitationDirection
    onAccept: () => void
    onDecline: () => void
    onCancel: () => void
}

const meta = {
    title: 'Entities/exchanges/ExchangeInvitationNotice',
    args: {
        partnerName: 'Мира',
        direction: 'incoming',
        onAccept: fn().mockName('accept'),
        onDecline: fn().mockName('decline'),
        onCancel: fn().mockName('cancel'),
    },
    argTypes: {
        partnerName: { control: 'text' },
        direction: { control: 'inline-radio', options: ['incoming', 'outgoing'] },
        onAccept: { control: false, table: { disable: true } },
        onDecline: { control: false, table: { disable: true } },
        onCancel: { control: false, table: { disable: true } },
    },
    render(args) {
        const host = renderVueStory(ExchangeInvitationNotice, { ...args })
        host.style.maxWidth = '418px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Outgoing: Story = { args: { direction: 'outgoing' } }

export const LongName: Story = { args: { partnerName: 'СеверныйСтранникИзДальнихЗемель' } }

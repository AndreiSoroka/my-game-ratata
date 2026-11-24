import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { draftOfferExample, editableDraftExample } from './exchangeDraftExample'
import ExchangeDraftPane from './ExchangeDraftPane.vue'
import type { ExchangeDraftOffer } from './exchangeWindowProps'

const meta = {
    title: 'Entities/exchanges/ExchangeDraftPane',
    args: { draft: draftOfferExample },
    argTypes: { draft: { control: 'object' } },
    render({ draft: initial }) {
        const { draft, ...actions } = editableDraftExample(initial)
        const host = renderVueStory(
            () => h(ExchangeDraftPane, { draft: draft.value, ...actions }),
            {},
            { padding: '16px' }
        )
        Object.assign(host.style, { maxWidth: '600px', minHeight: '0' })
        return host
    },
} satisfies Meta<{ draft: ExchangeDraftOffer }>

export default meta
type Story = StoryObj<{ draft: ExchangeDraftOffer }>

export const Default: Story = {}

export const Unavailable: Story = {
    args: { draft: { ...draftOfferExample, valid: false } },
}

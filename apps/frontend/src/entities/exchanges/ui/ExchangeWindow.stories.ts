import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h, ref, shallowRef } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { draftOfferExample, editableDraftExample } from './exchangeDraftExample'
import ExchangeWindow from './ExchangeWindow.vue'
import type { ExchangeWindowProps } from './exchangeWindowProps'

const actions = {
    onEdit: fn(),
    onPropose: fn(),
    onConfirm: fn(),
    onClose: fn(),
    onRestart: fn(),
}

const meta = {
    title: 'Entities/exchanges/ExchangeWindow',
    args: {
        exchange: {
            partnerName: 'Капля',
            status: 'active',
            own: {
                items: [{ instanceId: 'apple', itemId: 'food', quantity: 2 }],
                gold: 7,
                accepted: false,
            },
            other: {
                items: [{ instanceId: 'grain', itemId: 'grain', quantity: 3 }],
                gold: 0,
                accepted: false,
            },
        },
        draft: {
            ...draftOfferExample,
            editing: true,
            withdrawing: false,
            confirming: false,
            empty: false,
            canConfirm: false,
        },
        partnerAvailable: true,
    },
    argTypes: {
        exchange: { control: 'object' },
        draft: { control: 'object' },
        partnerAvailable: { control: 'boolean' },
    },
    render({ draft: initial, exchange, partnerAvailable }) {
        const { draft, ...draftActions } = editableDraftExample(initial)
        const preview = shallowRef(exchange)
        const editing = ref(initial.editing)
        const canConfirm = ref(initial.canConfirm)
        const hasReview = ref(initial.canResubmit || !initial.editing)
        function setAccepted(accepted: boolean) {
            preview.value = { ...preview.value, own: { ...preview.value.own, accepted } }
        }
        const host = renderVueStory(
            () =>
                h(ExchangeWindow, {
                    exchange: preview.value,
                    partnerAvailable,
                    ...actions,
                    ...draftActions,
                    draft: {
                        ...initial,
                        ...draft.value,
                        editing: editing.value,
                        canResubmit: hasReview.value,
                        canConfirm:
                            canConfirm.value && !draft.value.dirty && !preview.value.own.accepted,
                    },
                    onPropose() {
                        actions.onPropose()
                        if (!draft.value.dirty) {
                            editing.value = false
                            return
                        }
                        const items = draft.value.items
                            .filter((entry) => entry.selected > 0)
                            .map((entry) => ({ ...entry.item, quantity: entry.selected }))
                        const gold = draft.value.gold.selected
                        preview.value = {
                            ...preview.value,
                            own: { items, gold, accepted: false },
                            other: { ...preview.value.other, accepted: false },
                        }
                        draftActions.onPropose()
                        hasReview.value = true
                        editing.value = false
                        const other = preview.value.other
                        canConfirm.value =
                            items.length > 0 || gold > 0 || other.items.length > 0 || other.gold > 0
                    },
                    onEdit() {
                        actions.onEdit()
                        setAccepted(false)
                        editing.value = true
                    },
                    onConfirm() {
                        actions.onConfirm()
                        setAccepted(true)
                        hasReview.value = true
                        editing.value = false
                    },
                }),
            {},
            { background: 'var(--ui-dark-panel-surface)', padding: '16px' }
        )
        host.style.color = 'var(--ui-dark-panel-text)'
        host.style.display = 'flex'
        host.style.flexDirection = 'column'
        host.style.height = 'min(520px, 100dvh)'
        host.style.minHeight = '0'
        host.style.maxWidth = '1024px'
        return host
    },
} satisfies Meta<ExchangeWindowProps>

export default meta
type Story = StoryObj<ExchangeWindowProps>

export const Default: Story = {}

const submittedExchange = {
    ...meta.args.exchange,
    own: {
        ...meta.args.exchange.own,
        items: meta.args.draft.items.map((entry) => ({ ...entry.item, quantity: entry.selected })),
    },
}
const readOnlyDraft = { ...meta.args.draft, editing: false, dirty: false }

export const Submitted: Story = {
    args: { exchange: submittedExchange, draft: { ...readOnlyDraft, canConfirm: true } },
}

const acceptedExchange = {
    ...submittedExchange,
    own: { ...submittedExchange.own, accepted: true },
}

export const Accepted: Story = {
    args: { exchange: acceptedExchange, draft: readOnlyDraft },
}

export const Completed: Story = {
    args: {
        exchange: {
            ...acceptedExchange,
            status: 'completed',
            other: { ...acceptedExchange.other, accepted: true },
        },
        draft: readOnlyDraft,
    },
}

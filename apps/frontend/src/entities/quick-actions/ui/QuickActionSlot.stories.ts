import { abilityIds } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { QuickAction } from '../model/quickAction'
import QuickActionSlot from './QuickActionSlot.vue'
import {
    abilityExample,
    basicAttackExample,
    foodExample,
    saplingExample,
} from './quickActionStoryExamples'

interface StoryArgs {
    number: number
    action: QuickAction | null
    blocked?: boolean
    onActivate: () => void
    onAssign: () => void
    onClear: () => void
}

const meta = {
    title: 'Entities/quick-actions/QuickActionSlot',
    args: {
        number: 2,
        action: abilityExample('spark'),
        blocked: false,
        onActivate: fn().mockName('activate'),
        onAssign: fn().mockName('assign'),
        onClear: fn().mockName('clear'),
    },
    argTypes: {
        number: { control: { type: 'number', min: 1, max: 4, step: 1 } },
        action: { control: 'object' },
        blocked: { control: 'boolean' },
        onActivate: { control: false },
        onAssign: { control: false },
        onClear: { control: false },
    },
    render: (args) => renderVueStory(QuickActionSlot, { ...args }),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

interface SlotExample {
    caption: string
    action: QuickAction | null
    blocked?: boolean
}

function gallery(examples: SlotExample[], testId: string, args: StoryArgs): HTMLElement {
    const Gallery = {
        render: () =>
            h(
                'ul',
                {
                    'data-testid': testId,
                    style: {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 106px), 1fr))',
                        gap: '16px 6px',
                        maxWidth: '680px',
                        margin: '0',
                        padding: '0',
                        listStyle: 'none',
                    },
                },
                examples.map(({ action, blocked, caption }, index) =>
                    h(
                        'li',
                        {
                            key: caption,
                            style: {
                                display: 'grid',
                                alignContent: 'start',
                                justifyItems: 'center',
                                minWidth: 0,
                            },
                        },
                        [
                            h(QuickActionSlot, {
                                ...args,
                                number: (index % 4) + 1,
                                action,
                                blocked: blocked ?? false,
                            }),
                            h(
                                'span',
                                {
                                    style: {
                                        marginTop: '8px',
                                        maxWidth: '100%',
                                        overflowWrap: 'anywhere',
                                        textAlign: 'center',
                                    },
                                },
                                caption
                            ),
                        ]
                    )
                )
            ),
    }
    return renderVueStory(Gallery, {}, { padding: '16px' })
}

export const Default: Story = {}

export const AbilityCatalog: Story = {
    parameters: { controls: { disable: true } },
    render(args) {
        const examples = [
            basicAttackExample,
            ...abilityIds.map(abilityExample),
            foodExample,
            saplingExample,
        ]
        return gallery(
            examples.map((action) => ({ caption: action.label, action })),
            'quick-action-catalog',
            args
        )
    },
}

export const States: Story = {
    parameters: { controls: { disable: true } },
    render: (args) =>
        gallery(
            [
                { caption: 'Пусто', action: null },
                { caption: 'Готово', action: abilityExample('spark') },
                {
                    caption: 'Активная стойка',
                    action: { ...abilityExample('defensive_stance'), active: true },
                },
                {
                    caption: 'Автоповтор',
                    action: { ...abilityExample('shot'), active: true, repeat: 'Ожидает цель' },
                },
                {
                    caption: 'Перезарядка',
                    action: { ...abilityExample('barrier'), cooldownMs: 2400, unavailable: true },
                },
                {
                    caption: 'Нет маны',
                    action: {
                        ...abilityExample('spark'),
                        description: 'Недостаточно маны',
                        unavailable: true,
                    },
                },
                {
                    caption: 'Нельзя применить к цели',
                    action: {
                        ...basicAttackExample,
                        description: 'Для этой цели используйте F',
                        disabled: true,
                        unavailable: true,
                    },
                },
                { caption: 'Заблокировано', action: abilityExample('spark'), blocked: true },
                { caption: 'Три яблока', action: foodExample },
                { caption: 'Нет саженцев', action: { ...saplingExample, unavailable: true } },
            ],
            'quick-action-states',
            args
        ),
}

import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import type { QuickAction } from '../model/quickAction'
import QuickActionBar from './QuickActionBar.vue'
import {
    abilityExample,
    basicAttackExample,
    foodExample,
    saplingExample,
} from './quickActionStoryExamples'

interface StoryArgs {
    actions: readonly (QuickAction | null)[]
    blocked?: boolean
    waiting?: string
    onActivate: (index: number) => void
    onAssign: (index: number) => void
    onClear: (index: number) => void
}

const meta = {
    title: 'Entities/quick-actions/QuickActionBar',
    args: {
        actions: [basicAttackExample, abilityExample('spark'), foodExample, null],
        blocked: false,
        waiting: '',
        onActivate: fn().mockName('activate'),
        onAssign: fn().mockName('assign'),
        onClear: fn().mockName('clear'),
    },
    argTypes: {
        actions: { control: 'object' },
        blocked: { control: 'boolean' },
        waiting: { control: 'text' },
        onActivate: { control: false },
        onAssign: { control: false },
        onClear: { control: false },
    },
    render: (args) => renderVueStory(QuickActionBar, { ...args }, { padding: '48px 16px 16px' }),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const InCombat: Story = {
    args: {
        actions: [
            basicAttackExample,
            { ...abilityExample('shot'), active: true, repeat: 'Ожидает цель' },
            { ...abilityExample('barrier'), cooldownMs: 2400, unavailable: true },
            abilityExample('pray'),
        ],
        waiting: 'Автоповтор · ожидает цель',
    },
}

export const Inventory: Story = {
    args: { actions: [basicAttackExample, null, foodExample, saplingExample] },
}

export const Blocked: Story = { args: { blocked: true } }

export const Empty: Story = { args: { actions: [null, null, null, null] } }

import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationStar from './ConstellationStar.vue'

interface StoryArgs {
    node: ConstellationNodeSnapshot
    color: string
    selected: boolean
    enabled?: boolean
    interactive: boolean
    hitRadius?: number
    showHalo: boolean
    tabStop: boolean
    unitScale: number
    closedVisibility: number
}

const root: ConstellationNodeSnapshot = {
    id: 'prayer-root',
    constellationId: 'prayer',
    x: 0,
    y: 0,
    parents: [],
    unlocked: true,
    kind: 'root',
    name: 'Молитва',
}

const meta = {
    title: 'Entities/constellations/ConstellationStar',
    args: {
        node: root,
        color: '#f0d89c',
        selected: false,
        interactive: true,
        showHalo: true,
        tabStop: true,
        unitScale: 1,
        closedVisibility: 1,
    },
    argTypes: {
        node: { control: 'object' },
        color: { control: 'color' },
        selected: { control: 'boolean' },
        enabled: { control: 'boolean' },
        interactive: { control: 'boolean' },
        hitRadius: { control: { type: 'number', min: 1, max: 66, step: 1 } },
        showHalo: { control: 'boolean' },
        tabStop: { control: 'boolean' },
        unitScale: { control: { type: 'number', min: 0.1, max: 3, step: 0.1 } },
        closedVisibility: {
            control: { type: 'range', min: 0, max: 1, step: 0.05 },
            description: 'Доля видимости закрытой звезды при приближении.',
        },
    },
    render({ closedVisibility, ...args }) {
        return renderVueStory(
            {
                render: () =>
                    h(
                        'svg',
                        {
                            viewBox: '-80 -80 160 160',
                            width: 160,
                            height: 160,
                            style: { '--constellation-closed-visibility': closedVisibility },
                        },
                        [h(ConstellationStar, { ...args, enabled: args.enabled })]
                    ),
            },
            {},
            { background: 'var(--ui-dark-panel-surface)' }
        )
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Selected: Story = { args: { selected: true } }

export const Inactive: Story = { args: { enabled: false } }

export const Closed: Story = {
    args: {
        node: {
            id: 'neighbor',
            constellationId: 'prayer',
            x: 0,
            y: 0,
            parents: [root.id],
            unlocked: false,
        },
        interactive: false,
        tabStop: false,
    },
}

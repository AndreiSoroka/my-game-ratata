import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { ConstellationStarCard } from '@/entities/constellations'
import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'

import ConstellationAtlasWidget from './ConstellationAtlasWidget.vue'

const root: ConstellationNodeSnapshot = {
    id: 'prayer',
    constellationId: 'prayer',
    x: 0,
    y: 0,
    parents: [],
    unlocked: true,
    name: 'Молитва',
    description: 'Восстанавливает здоровье союзника.',
    effectType: 'active',
}
const constellation: ConstellationSnapshot = {
    version: 1,
    paths: [{ id: 'prayer', color: '#dfca93', name: 'Угольная Мать', unlocked: true }],
    nodes: [
        root,
        {
            id: 'radius',
            constellationId: 'prayer',
            x: 95,
            y: -60,
            parents: [root.id],
            unlocked: false,
        },
    ],
    edges: [{ from: root.id, to: 'radius' }],
}

type Args = {
    constellation: ConstellationSnapshot
    selectedStar: ConstellationNodeSnapshot
    enabledIds?: string[]
    mapId?: string
    mapKey?: number
    sidebar: StorySlot
}

const meta = {
    title: 'Widgets/constellation-atlas/ConstellationAtlasWidget',
    args: { constellation, selectedStar: root, sidebar: 'none' },
    argTypes: {
        constellation: { control: 'object' },
        selectedStar: { control: 'object' },
        enabledIds: { control: 'object' },
        mapId: { control: 'text' },
        mapKey: { control: 'number' },
        sidebar: storySlotControl('Боковая панель'),
    },
    render: ({ sidebar, enabledIds, ...args }) => {
        const props = { ...args, enabledStarIds: enabledIds && new Set(enabledIds) }
        const renderSidebar = storySlot<{ node?: ConstellationNodeSnapshot }>(
            sidebar,
            'Выбранная звезда',
            ({ node }) => node && h(ConstellationStarCard, { node })
        )
        return renderVueStory(
            () =>
                h(ConstellationAtlasWidget, props, renderSidebar ? { sidebar: renderSidebar } : {}),
            {}
        )
    },
} satisfies Meta<Args>

export default meta
export const Default: StoryObj<Args> = {}
export const Sidebar: StoryObj<Args> = { args: { sidebar: 'text' } }

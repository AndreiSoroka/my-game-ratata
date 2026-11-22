import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

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
    sidebar: 'default' | 'empty' | 'name'
}

const meta = {
    title: 'Widgets/constellation-atlas/ConstellationAtlasWidget',
    args: { constellation, selectedStar: root, sidebar: 'default' },
    argTypes: {
        constellation: { control: 'object' },
        selectedStar: { control: 'object' },
        sidebar: { control: 'select', options: ['default', 'empty', 'name'] },
    },
    render: ({ sidebar, ...props }) =>
        sidebar === 'default'
            ? renderVueStory(ConstellationAtlasWidget, props)
            : renderVueStory(
                  () =>
                      h(ConstellationAtlasWidget, props, {
                          sidebar: ({ node }: { node?: ConstellationNodeSnapshot }) =>
                              sidebar === 'name' ? h('p', node?.name) : h('div'),
                      }),
                  {}
              ),
} satisfies Meta<Args>

export default meta
export const Default: StoryObj<Args> = {}
export const Sidebar: StoryObj<Args> = { args: { sidebar: 'name' } }

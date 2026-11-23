import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationGraph from './ConstellationGraph.vue'

const sky: ConstellationSnapshot = {
    version: 1,
    paths: [
        { id: 'blade', name: 'Клинок', color: '#f5d098', unlocked: true },
        { id: 'prayer_grave', name: 'Прах', color: '#b7b9db', unlocked: true },
        { id: 'arrow', color: '#c9d7a0', unlocked: false },
    ],
    nodes: [
        {
            id: 'blade',
            constellationId: 'blade',
            x: -180,
            y: 10,
            parents: [],
            unlocked: true,
            name: 'Клинок',
        },
        {
            id: 'slash',
            constellationId: 'blade',
            x: -70,
            y: -55,
            parents: ['blade'],
            unlocked: true,
            name: 'Удар',
        },
        {
            id: 'parry',
            constellationId: 'blade',
            x: -38,
            y: -55,
            parents: ['blade'],
            unlocked: true,
            name: 'Парирование',
        },
        {
            id: 'strike',
            constellationId: 'blade',
            x: 20,
            y: 70,
            parents: ['blade'],
            unlocked: true,
            name: 'Выпад',
        },
        {
            id: 'guard',
            constellationId: 'blade',
            x: -60,
            y: 125,
            parents: ['blade'],
            unlocked: false,
        },
        {
            id: 'finesse',
            constellationId: 'blade',
            x: 35,
            y: 125,
            parents: ['blade'],
            unlocked: false,
            levelLocked: true,
        },
        {
            id: 'grave',
            constellationId: 'prayer_grave',
            x: 200,
            y: 70,
            parents: [],
            unlocked: true,
            name: 'Прах',
        },
        { id: 'arrow', constellationId: 'arrow', x: 100, y: -180, parents: [], unlocked: false },
    ],
    edges: [
        { from: 'blade', to: 'slash' },
        { from: 'blade', to: 'guard' },
        { from: 'slash', to: 'grave', via: [{ x: 25, y: -90 }], crossLink: true },
        { from: 'blade', to: 'parry' },
        { from: 'blade', to: 'strike' },
        { from: 'blade', to: 'finesse' },
    ],
}

type Args = {
    constellation: ConstellationSnapshot
    selectedId?: string
    debug: boolean
    enabledIds: string[]
}

const meta = {
    title: 'Entities/constellations/ConstellationGraph',
    args: { constellation: sky, selectedId: 'blade', debug: false, enabledIds: ['blade'] },
    argTypes: {
        constellation: { control: 'object' },
        selectedId: { control: 'text' },
        debug: { control: 'boolean' },
        enabledIds: { control: 'object', if: { arg: 'debug' } },
    },
    render: ({ constellation, selectedId, debug, enabledIds }) =>
        renderVueStory(ConstellationGraph, {
            constellation,
            selectedId,
            enabledStarIds: debug ? new Set(enabledIds) : undefined,
        }),
} satisfies Meta<Args>

export default meta
export const Default: StoryObj<Args> = {}
export const Debug: StoryObj<Args> = { args: { debug: true } }

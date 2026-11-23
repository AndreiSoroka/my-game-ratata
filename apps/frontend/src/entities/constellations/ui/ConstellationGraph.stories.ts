import type { ConstellationPathSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
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

const depthPaths = [
    { id: 'blade', name: 'Клинок', color: '#f5d098', unlocked: true },
    { id: 'magic', name: 'Магия', color: '#bccbff', unlocked: true },
    { id: 'prayer', name: 'Молитва', color: '#f0d6ab', unlocked: true },
    { id: 'arrow', name: 'Стрела', color: '#c9d7a0', unlocked: true },
    { id: 'life', name: 'Жизнь', color: '#ecc5a9', unlocked: true },
] satisfies ConstellationPathSnapshot[]
const layeredSky: ConstellationSnapshot = {
    version: 1,
    paths: depthPaths,
    nodes: [
        ...depthPaths.map(({ id, name }, index) => ({
            id,
            name,
            constellationId: id,
            x: (index - 2) * 135,
            y: 0,
            parents: [],
            unlocked: true,
        })),
        {
            id: 'devotion',
            constellationId: 'prayer',
            x: 54,
            y: -70,
            parents: ['prayer'],
            unlocked: true,
            name: 'Преданность',
        },
    ],
    edges: [
        { from: 'prayer', to: 'devotion', via: [{ x: 16, y: -40 }] },
        { from: 'devotion', to: 'life', via: [{ x: 145, y: -100 }], crossLink: true },
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
export const FiveDepths: StoryObj<Args> = {
    args: { constellation: layeredSky, selectedId: 'prayer' },
}

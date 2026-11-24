import '../ui/rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { routeFixture } from '../testing/automationFixture'
import { characterFixture } from '../testing/characterFixture'
import ActionChannelStatus from '../ui/ActionChannelStatus.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/ActionChannelStatus' } satisfies Meta
export default meta
type Story = StoryObj

export const PurifyingGrave: Story = {
    render: () =>
        renderVueStory(ActionChannelStatus, {
            player: characterFixture('cleric', {
                abilities: {
                    known: ['pray'],
                    cooldowns: {},
                    barrier: null,
                    casting: {
                        abilityId: 'pray',
                        mode: 'purify_grave',
                        targetId: 'grave',
                        target: { kind: 'grave', id: 'grave' },
                        startedAt: 0,
                        completesAt: 3000,
                    },
                },
            }),
        }),
}

export const MaintainingChains: Story = {
    render: () =>
        renderVueStory(ActionChannelStatus, {
            player: characterFixture('arcanist', {
                abilities: {
                    known: ['chains'],
                    cooldowns: {},
                    barrier: null,
                    casting: null,
                    magicChannel: { abilityId: 'chains', startedAt: 0, completesAt: 5000 },
                },
            }),
            serverTime: 2000,
        }),
}

export const WitheringBolt: Story = {
    render: () =>
        renderVueStory(ActionChannelStatus, {
            player: characterFixture('necromancer', {
                abilities: {
                    known: ['ash_exhaustion'],
                    cooldowns: {},
                    barrier: null,
                    casting: null,
                    ashCasting: {
                        abilityId: 'ash_exhaustion',
                        targetId: 'hostile',
                        startedAt: 0,
                        completesAt: 2000,
                    },
                },
            }),
            serverTime: 100,
        }),
}

export const BlockedRoute: Story = {
    render: () =>
        renderVueStory(ActionChannelStatus, {
            player: characterFixture('route-walker', {
                control: { mode: 'route', targetId: null, route: routeFixture() },
            }),
        }),
}

export const RouteInProgress: Story = {
    render: () =>
        renderVueStory(ActionChannelStatus, {
            player: characterFixture('route-walker', {
                control: { mode: 'route', targetId: null, route: routeFixture({ waiting: null }) },
            }),
        }),
}

export const StunnedWhileBlocked: Story = {
    render: () => {
        const player = characterFixture('route-walker', {
            control: { mode: 'route', targetId: null, route: routeFixture() },
        })
        return renderVueStory(ActionChannelStatus, {
            player: { ...player, cooldowns: { ...player.cooldowns, stunMsLeft: 2_000 } },
        })
    },
}

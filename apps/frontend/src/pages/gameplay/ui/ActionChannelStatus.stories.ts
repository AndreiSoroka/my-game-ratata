import './rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '../../../game/stories/renderVueStory'
import { routeFixture } from '../../../game/testing/automationFixture'
import { characterFixture } from '../../../game/testing/characterFixture'
import ActionChannelStatus from './ActionChannelStatus.vue'

type StoryArgs = Pick<InstanceType<typeof ActionChannelStatus>['$props'], 'player' | 'serverTime'>
const meta = {
    title: 'Game/ActionChannelStatus',
    args: {
        serverTime: 2000,
        player: characterFixture('arcanist', {
            abilities: {
                known: ['chains'],
                cooldowns: {},
                barrier: null,
                casting: null,
                magicChannel: { abilityId: 'chains', startedAt: 0, completesAt: 5000 },
            },
        }),
    },
    argTypes: { player: { control: 'object' }, serverTime: { control: 'number' } },
    render: (args) => renderVueStory(ActionChannelStatus, args),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

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

export const MaintainingChains: Story = {}

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

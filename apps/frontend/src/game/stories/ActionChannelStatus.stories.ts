import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import ActionChannelStatus from '../ui/ActionChannelStatus.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Prayer channel' } satisfies Meta
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
            serverTime: 500,
        }),
}

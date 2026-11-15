import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { LONG_PLAYER_NAME, playerStatusFixture } from '../testing/playerStatusFixture'
import PlayerStatusPanel from '../ui/PlayerStatusPanel.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Player status' } satisfies Meta
export default meta
type Story = StoryObj

export const Normal: Story = {
    render: () => renderVueStory(PlayerStatusPanel, { character: playerStatusFixture() }),
}
export const LongName: Story = {
    render: () =>
        renderVueStory(PlayerStatusPanel, {
            character: playerStatusFixture({ nickname: LONG_PLAYER_NAME }),
        }),
}
export const EmptyResources: Story = {
    render: () =>
        renderVueStory(PlayerStatusPanel, {
            character: playerStatusFixture({
                health: { kind: 'percent', percent: 0 },
                resources: {
                    mana: { kind: 'percent', percent: 0, hasCapacity: true },
                    energy: { kind: 'percent', percent: 0, hasCapacity: true },
                },
            }),
        }),
}
export const LowResources: Story = {
    render: () =>
        renderVueStory(PlayerStatusPanel, {
            character: playerStatusFixture({
                health: { kind: 'percent', percent: 3 },
                resources: {
                    mana: { kind: 'percent', percent: 5, hasCapacity: true },
                    energy: { kind: 'percent', percent: 5, hasCapacity: true },
                },
            }),
        }),
}
export const AuthorizedNumbers: Story = {
    render: () =>
        renderVueStory(PlayerStatusPanel, {
            character: playerStatusFixture({
                health: { kind: 'exact', current: 17.870400000000018, max: 30 },
                resources: {
                    mana: { kind: 'exact', current: 39.6, max: 40 },
                    energy: { kind: 'exact', current: 102.4, max: 150 },
                },
            }),
        }),
}
export const ScriptedEcho: Story = {
    render: () =>
        renderVueStory(PlayerStatusPanel, {
            character: playerStatusFixture({
                soul: {
                    kind: 'echo',
                    controlSource: 'script',
                    canSpeak: false,
                    personality: 'Молчаливый',
                    companion: null,
                },
            }),
        }),
}

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
                hp: 0,
                resources: { mana: 0, maxMana: 120, energy: 0, maxEnergy: 100 },
            }),
        }),
}
export const LowResources: Story = {
    render: () =>
        renderVueStory(PlayerStatusPanel, {
            character: playerStatusFixture({
                hp: 1,
                resources: { mana: 6, maxMana: 120, energy: 5, maxEnergy: 100 },
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

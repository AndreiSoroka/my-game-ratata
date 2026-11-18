import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import {
    faithKnownStatusFixture,
    faithOmenStatusFixture,
    LONG_PLAYER_NAME,
    playerStatusFixture,
    wantedStatusFixture,
} from '../testing/playerStatusFixture'
import PlayerStatusPanel from '../ui/PlayerStatusPanel.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Player status' } satisfies Meta
export default meta
type Story = StoryObj

/** Mount in a real game host so ResizeObserver publishes the HUD's occupied space. */
function statusStory(props: { character: CharacterSnapshot }): HTMLElement {
    const host = renderVueStory(
        {
            render: () =>
                h('section', { class: 'game-screen', style: 'position:relative;height:100dvh' }, [
                    h(PlayerStatusPanel, props),
                ]),
        },
        {}
    )
    host.style.padding = '0'
    host.style.minHeight = '100dvh'
    return host
}

export const Normal: Story = {
    render: () => statusStory({ character: playerStatusFixture() }),
}
export const LongName: Story = {
    render: () =>
        statusStory({
            character: playerStatusFixture({ nickname: LONG_PLAYER_NAME }),
        }),
}
export const EmptyResources: Story = {
    render: () =>
        statusStory({
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
        statusStory({
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
        statusStory({
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
        statusStory({
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

export const FaithKnown: Story = {
    render: () => statusStory({ character: faithKnownStatusFixture() }),
}
export const FaithOmen: Story = {
    render: () => statusStory({ character: faithOmenStatusFixture() }),
}
export const Wanted: Story = {
    render: () => statusStory({ character: wantedStatusFixture() }),
}

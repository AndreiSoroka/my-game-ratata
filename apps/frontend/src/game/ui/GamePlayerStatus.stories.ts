import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '../stories/renderVueStory'
import {
    faithKnownStatusFixture,
    faithPreciseStatusFixture,
    faithUnknownMoodStatusFixture,
    LONG_PLAYER_NAME,
    playerStatusFixture,
    wantedStatusFixture,
} from '../testing/playerStatusFixture'
import GamePlayerStatus from './GamePlayerStatus.vue'

const meta = { title: 'Game/Player HUD' } satisfies Meta
export default meta
type Story = StoryObj

/** Mount in a real game host so ResizeObserver publishes the HUD's occupied space. */
function statusStory(props: { character: CharacterSnapshot; serverTime?: number }): HTMLElement {
    const host = renderVueStory(
        {
            render: () =>
                h('section', { class: 'game-screen', style: 'position:relative;height:100dvh' }, [
                    h(GamePlayerStatus, props),
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

export const LowHealth: Story = {
    render: () =>
        statusStory({
            character: playerStatusFixture({ health: { kind: 'percent', percent: 25 } }),
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
                },
            }),
        }),
}

export const FaithKnown: Story = {
    render: () => statusStory({ character: faithKnownStatusFixture() }),
}
export const FaithUnknownMood: Story = {
    render: () => statusStory({ character: faithUnknownMoodStatusFixture() }),
}
export const FaithPrecise: Story = {
    render: () => statusStory({ character: faithPreciseStatusFixture() }),
}
export const Wanted: Story = {
    render: () => statusStory({ character: wantedStatusFixture() }),
}

export const ActiveEffects: Story = {
    render: () => {
        const character = wantedStatusFixture()
        return statusStory({
            serverTime: 1_000,
            character: {
                ...character,
                abilities: { ...character.abilities!, barrier: { expiresAt: 6_000 } },
                prayerAuraEffects: ['prayer-blessing'],
            },
        })
    },
}

export const ManyEffects: Story = {
    render: () => {
        const character = wantedStatusFixture()
        return statusStory({
            serverTime: 1_000,
            character: {
                ...character,
                cooldowns: { ...character.cooldowns, stunMsLeft: 800 },
                abilities: { ...character.abilities!, barrier: { expiresAt: 6_000 } },
                combat: { defensiveStance: true, combo: { stacks: 2, limit: 3, expiresAt: 5_000 } },
                movement: { mode: 'sneaking', dashing: false, dashCooldownMsLeft: 0 },
                prayerAuraEffects: ['prayer-blessing', 'prayer-protection'],
            },
        })
    },
}

const hudPalettes = [
    { label: 'Графит', surface: '#191e26f2', border: '#8d99a6' },
    { label: 'Тёмный янтарь', surface: '#38291df2', border: '#bb9052' },
    { label: 'Бежевая рамка · в игре' },
]

export const DarkPalettes: Story = {
    render() {
        const character: CharacterSnapshot = {
            ...wantedStatusFixture(),
            health: { kind: 'percent', percent: 76 },
            resources: {
                mana: { kind: 'percent', percent: 61, hasCapacity: true },
                energy: { kind: 'percent', percent: 88, hasCapacity: true },
            },
            prayerAuraEffects: ['prayer-blessing'],
        }

        return renderVueStory(
            {
                render: () =>
                    h(
                        'div',
                        {
                            style: {
                                display: 'grid',
                                gridTemplateColumns:
                                    'repeat(auto-fit, minmax(min(100%, 330px), 1fr))',
                                gap: '16px',
                            },
                        },
                        hudPalettes.map(({ label, surface, border }) =>
                            h('div', { key: label }, [
                                h('h2', { style: { margin: '0 0 8px', color: '#f4e7cc' } }, label),
                                h(
                                    'section',
                                    {
                                        class: 'game-screen',
                                        style: {
                                            position: 'relative',
                                            height: '560px',
                                            background:
                                                'linear-gradient(145deg, #539765 0 38%, #a5ad9e 38% 68%, #539765 68%)',
                                            '--character-hud-surface': surface,
                                            '--character-hud-border': border,
                                        },
                                    },
                                    [
                                        h(GamePlayerStatus, {
                                            character,
                                            style: {
                                                '--game-player-status-top': '26px',
                                                right: '50%',
                                                transform: 'translateX(50%)',
                                            },
                                        }),
                                    ]
                                ),
                            ])
                        )
                    ),
            },
            {}
        )
    },
}

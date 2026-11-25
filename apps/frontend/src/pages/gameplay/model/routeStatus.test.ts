import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'

import { routeFixture } from '../../../game/testing/automationFixture'
import { characterFixture, worldFixture } from '../../../game/testing/characterFixture'
import ActionChannelStatus from '../ui/ActionChannelStatus.vue'
import GameplayOverlay from '../ui/GameplayOverlay.vue'
import { useEscapeOwner } from './uiEscapeOwners'

function walker(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
    return characterFixture('walker', {
        control: { mode: 'route', targetId: null, route: routeFixture() },
        ...overrides,
    })
}

it('shows the current stable route number and the server countdown, without advancing its own timer', async () => {
    vi.useFakeTimers()
    const wrapper = mount(ActionChannelStatus, { props: { player: walker() } })
    try {
        expect(wrapper.get('[role="status"]').text()).toContain('Точка 4: путь перекрыт')
        expect(wrapper.text()).toContain('отмена через 8 с')
        expect(wrapper.text()).toContain('Esc — остановить')
        vi.advanceTimersByTime(30_000)
        await nextTick()
        expect(wrapper.text()).toContain('отмена через 8 с')
        await wrapper.setProps({
            player: walker({
                control: {
                    mode: 'route',
                    targetId: null,
                    route: routeFixture({ remainingFailureMs: 3100 }),
                },
            }),
        })
        expect(wrapper.text()).toContain('отмена через 4 с')
        await wrapper.get('button').trigger('click')
        expect(wrapper.emitted('cancelRoute')).toEqual([[]])
    } finally {
        wrapper.unmount()
        vi.useRealTimers()
    }
})

it.each(['moving', 'cancelled', 'dead', 'empty'] as const)(
    'hides blocked route feedback when %s',
    async (state) => {
        const wrapper = mount(ActionChannelStatus, {
            props: { player: walker() },
        })
        try {
            const player =
                state === 'dead'
                    ? walker({ alive: false })
                    : state === 'cancelled'
                      ? walker({ control: { mode: 'none', targetId: null } })
                      : walker({
                            control: {
                                mode: 'route',
                                targetId: null,
                                route: routeFixture(
                                    state === 'moving' ? { waiting: null } : { points: [] }
                                ),
                            },
                        })
            await wrapper.setProps({ player })
            expect(wrapper.find('[role="status"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    }
)

it('hides the blocked route during stun or prayer', async () => {
    const player = walker()
    const castingPlayer = walker({
        abilities: {
            known: ['pray'],
            cooldowns: {},
            barrier: null,
            casting: {
                abilityId: 'pray',
                mode: 'purify_grave',
                targetId: 'grave',
                startedAt: 0,
                completesAt: 10_000,
            },
        },
    })
    const stunnedCooldowns = { ...player.cooldowns, stunMsLeft: 2000 }
    const wrapper = mount(ActionChannelStatus, {
        props: { player: { ...player, cooldowns: stunnedCooldowns } },
    })
    try {
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        await wrapper.setProps({
            player: { ...castingPlayer, cooldowns: stunnedCooldowns },
        })
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        await wrapper.setProps({ player: castingPlayer })
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        await wrapper.setProps({ player })
        expect(wrapper.get('[role="status"]').text()).toContain('путь перекрыт')
    } finally {
        wrapper.unmount()
    }
})

it('cancels through the ordinary command on mobile click or Escape, after higher-priority UI', async () => {
    const player = walker(),
        send = vi.fn<() => void>()
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters: [player],
            snapshot: worldFixture([player]),
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: vi.fn<() => void>(),
                isInteractionVisible: () => true,
            } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
        attachTo: document.body,
    })
    try {
        const button = wrapper.get<HTMLButtonElement>('.control-status--route button')
        send.mockClear()
        await button.trigger('click')
        expect(send.mock.calls).toEqual([[{ type: 'cancel_control' }]])
        send.mockClear()
        const closeWindow = vi.fn<() => void>()
        const upper = mount(
            defineComponent({
                setup() {
                    useEscapeOwner({ priority: 100, active: () => true, escape: closeWindow })
                    return () => null
                },
            })
        )
        const escape = () =>
            button.element.dispatchEvent(
                new KeyboardEvent('keydown', {
                    code: 'Escape',
                    key: 'Escape',
                    bubbles: true,
                    cancelable: true,
                })
            )
        try {
            button.element.focus()
            escape()
            expect(closeWindow).toHaveBeenCalledOnce()
            expect(send).not.toHaveBeenCalled()
        } finally {
            upper.unmount()
        }
        escape()
        expect(send.mock.calls).toEqual([[{ type: 'cancel_control' }]])
    } finally {
        wrapper.unmount()
    }
})

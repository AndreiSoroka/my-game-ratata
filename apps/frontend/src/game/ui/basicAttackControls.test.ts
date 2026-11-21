import type { CharacterSnapshot, ClientMessage, Vector2 } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { clickWithPointer } from '../testing/clickWithPointer'
import GameplayOverlay from './GameplayOverlay.vue'

function pressCombatKey(code: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
}

function mountCombatOverlay(
    player: CharacterSnapshot,
    targets: CharacterSnapshot[],
    visibility?: {
        onScreen?: (target: { id: string }) => boolean
        lineOfSight?: (position: Vector2) => boolean
    }
) {
    const send = vi.fn<(message: ClientMessage) => void>()
    const highlight = vi.fn<(target: { id: string; kind: string } | undefined) => void>()
    const characters = [player, ...targets]
    const wrapper = mount(GameplayOverlay, {
        props: {
            player,
            characters,
            snapshot: worldFixture(characters),
            blocked: false,
            game: {
                sendCommand: send,
                setCombatTarget: highlight,
                isInteractionVisible: visibility?.lineOfSight ?? (() => true),
                isSelectionVisible: visibility?.onScreen ?? (() => true),
            } as never,
        },
        global: { stubs: { SpeechBubbles: true } },
    })
    const attacks = () =>
        send.mock.calls
            .map(([command]) => command)
            .filter((command) => command.type === 'attack' || command.type === 'auto_action')
    return { wrapper, send, highlight, attacks }
}

function oneAttack(targetId: string) {
    return { type: 'auto_action', action: { kind: 'attack', targetId, once: true } } as const
}

function hostileAt(id: string, x: number, overrides: Partial<CharacterSnapshot> = {}) {
    return characterFixture(id, {
        position: { x, y: 0 },
        relationship: 'hostile',
        faction: 'monsters',
        ...overrides,
    })
}

it.each(['enemy', 'dummy'])(
    'selects and highlights the nearest eligible %s when clicking the attack slot',
    async (nearest) => {
        const player = characterFixture('self')
        const enemy = hostileAt('enemy', nearest === 'enemy' ? 56 : 88)
        const dummy = characterFixture('dummy', {
            position: { x: nearest === 'dummy' ? 56 : 88, y: 0 },
            relationship: 'friendly',
            trainingTarget: { areaId: 'yard' },
        })
        const nearerAlly = characterFixture('friend', { position: { x: 24, y: 0 } })
        const wall = hostileAt('behind-wall', 16)
        const offscreen = hostileAt('offscreen', 8)
        const dead = hostileAt('dead', 32, { alive: false })
        const offline = hostileAt('offline', 40, { tags: ['offline'] })
        const { attacks, highlight, wrapper } = mountCombatOverlay(
            player,
            [enemy, dummy, nearerAlly, wall, offscreen, dead, offline],
            {
                onScreen: (target) => target.id !== offscreen.id,
                lineOfSight: (position) => position.x !== wall.position.x,
            }
        )
        try {
            await clickWithPointer(wrapper.get('.hotbar-slot').element)
            expect(wrapper.vm.selectedId).toBe(nearest)
            expect(wrapper.get('[aria-label="Выбранная цель"]').text()).toContain(nearest)
            expect(highlight).toHaveBeenLastCalledWith(
                expect.objectContaining({ id: nearest, kind: 'character' })
            )
            expect(attacks()).toEqual([oneAttack(nearest)])
        } finally {
            wrapper.unmount()
        }
    }
)

it('keeps a manually selected enemy and queues the single attack during cooldown', async () => {
    const player = characterFixture('self', {
        cooldowns: { attackMsLeft: 200, respawnMsLeft: 0, stunMsLeft: 0 },
    })
    const near = hostileAt('near', 32)
    const far = hostileAt('far', 80)
    const { attacks, wrapper } = mountCombatOverlay(player, [near, far])
    try {
        expect(wrapper.vm.select(far.id)).toBe(true)
        await wrapper.vm.$nextTick()
        pressCombatKey('Digit1')
        expect(wrapper.vm.selectedId).toBe(far.id)
        expect(attacks()).toEqual([oneAttack(far.id)])
    } finally {
        wrapper.unmount()
    }
})

it('swings without a selected target when only allies and out-of-range enemies are visible', async () => {
    const player = characterFixture('self')
    const friend = characterFixture('friend')
    const far = hostileAt('outside-selection-range', 193)
    const { attacks, wrapper } = mountCombatOverlay(player, [friend, far])
    try {
        pressCombatKey('Digit1')
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.selectedKey).toBeUndefined()
        expect(wrapper.find('[aria-label="Выбранная цель"]').exists()).toBe(false)
        expect(attacks()).toEqual([{ type: 'attack' }])
    } finally {
        wrapper.unmount()
    }
})

it.each([
    ['before rendering', undefined],
    ['after the server confirms the approach', 'range'],
    ['after the server starts the swing', 'idle'],
] as const)(
    'repeats the auto-selected attack %s and stops on the third press',
    async (_, state) => {
        const time = vi.spyOn(performance, 'now').mockReturnValue(1000)
        const player = characterFixture('self')
        const target = hostileAt('target', 80)
        const competingTarget = hostileAt('other', 96)
        const { attacks, wrapper } = mountCombatOverlay(player, [target, competingTarget])
        const once = oneAttack(target.id)
        const repeated = { type: 'auto_action', action: { kind: 'attack', targetId: target.id } }
        try {
            pressCombatKey('Digit1')
            expect(attacks()).toEqual([once])
            if (state) {
                await wrapper.setProps({
                    player: {
                        ...player,
                        cooldowns: {
                            ...player.cooldowns,
                            attackMsLeft: state === 'idle' ? 600 : 0,
                        },
                        control:
                            state === 'range'
                                ? {
                                      mode: 'action',
                                      targetId: target.id,
                                      action: once.action,
                                      waiting: 'range',
                                  }
                                : { mode: 'none', targetId: null },
                    },
                    characters: [player, target, { ...competingTarget, position: { x: 24, y: 0 } }],
                })
            }
            const waiting = wrapper.find('.hotbar-waiting')
            expect(waiting.exists() ? waiting.text() : undefined).toBe(
                state === 'range' ? 'Подходим к цели' : undefined
            )
            expect(wrapper.find('[aria-label="Автоповтор"]').exists()).toBe(false)

            time.mockReturnValue(1300)
            pressCombatKey('Digit1')
            await wrapper.vm.$nextTick()
            expect(attacks()).toEqual([once, repeated])
            expect(wrapper.vm.selectedId).toBe(target.id)
            expect(wrapper.get('[aria-label="Автоповтор"]').text()).toBe('↻')
            pressCombatKey('Digit1')
            await wrapper.vm.$nextTick()
            expect(attacks()).toEqual([once, repeated, { type: 'auto_action', action: null }])
            expect(wrapper.find('[aria-label="Автоповтор"]').exists()).toBe(false)
        } finally {
            wrapper.unmount()
            time.mockRestore()
        }
    }
)

it('cancels a just-issued approach that loses the selected target before the server reply', async () => {
    const time = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const player = characterFixture('self')
    const target = hostileAt('target', 80)
    let visible = true
    const { attacks, send, wrapper } = mountCombatOverlay(player, [target], {
        onScreen: () => visible,
    })
    try {
        pressCombatKey('Digit1')
        await wrapper.vm.$nextTick()
        expect(attacks()).toEqual([oneAttack(target.id)])
        time.mockReturnValue(1500)
        visible = false
        await wrapper.setProps({ snapshot: { ...worldFixture([player, target]), tick: 2 } })
        expect(wrapper.vm.selectedId).toBeUndefined()
        expect(send).toHaveBeenLastCalledWith({ type: 'cancel_control' })
        pressCombatKey('Digit1')
        expect(attacks()).toEqual([oneAttack(target.id), { type: 'attack' }])
    } finally {
        wrapper.unmount()
        time.mockRestore()
    }
})

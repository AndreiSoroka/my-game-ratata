import type { ClientMessage } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { RuntimeMovementControls } from './runtimeMovementControls'
import { handleRuntimeShortcut } from './runtimeShortcuts'

const key = (code: string, repeat = false) =>
    new KeyboardEvent('keydown', { code, repeat, cancelable: true })

describe('shared movement commands', () => {
    it('ignores both Shift keys and keeps sneak and dash as separate explicit actions', () => {
        const send = vi.fn<(command: ClientMessage) => void>()
        const controls = new RuntimeMovementControls(send)
        expect(controls.keyDown(key('ShiftLeft'))).toBe(false)
        expect(controls.keyDown(key('ShiftRight'))).toBe(false)
        expect(send).not.toHaveBeenCalled()
        controls.keyDown(key('KeyC'))
        controls.keyDown(key('KeyC', true))
        expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'movement_mode', mode: 'sneaking' })
        controls.release()
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'sneaking' })
        controls.keyDown(key('KeyC'))
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'walking' })
    })
    it('lets C enter stealth with one press after a server stun or death interrupts it', () => {
        const send = vi.fn<(command: ClientMessage) => void>()
        const controls = new RuntimeMovementControls(send)
        controls.keyDown(key('KeyC'))
        controls.observe(characterFixture('hero', { alive: false }))
        controls.keyDown(key('KeyC'))
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'sneaking' })
    })
    it('resets sneak on a walking prayer without requiring held movement to be released', () => {
        const send = vi.fn<(command: ClientMessage) => void>()
        const controls = new RuntimeMovementControls(send)
        const walking = characterFixture('hero', {
            movement: { mode: 'walking', dashing: false, dashCooldownMsLeft: 0 },
        })
        const praying = characterFixture('hero', {
            ...walking,
            abilities: {
                known: [],
                cooldowns: {},
                barrier: null,
                casting: {
                    abilityId: 'pray_road',
                    targetId: walking.id,
                    startedAt: 5,
                    completesAt: 3005,
                    walkWhileCasting: true,
                },
            },
        })
        controls.keyDown(key('KeyC'))
        expect(controls.observe(praying)).toBe(false)
        controls.keyDown(key('KeyC'))
        expect(send).toHaveBeenCalledTimes(1)
        controls.release()
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'walking' })
        controls.observe(walking)
        controls.keyDown(key('KeyC'))
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'sneaking' })
    })
    it('cancels committed movement on release and preserves a selected sneak mode', () => {
        const send = vi.fn<(command: ClientMessage) => void>()
        const controls = new RuntimeMovementControls(send)
        controls.keyDown(key('Space'))
        controls.release()
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'walking' })
        controls.acceptMode('sneaking')
        controls.release()
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'sneaking' })
    })
    it('sends one dash, leaves Q unused, and follows the authoritative end of stealth', () => {
        const send = vi.fn<(command: ClientMessage) => void>()
        const controls = new RuntimeMovementControls(send)
        controls.keyDown(key('KeyC'))
        controls.keyDown(key('Space'))
        controls.keyDown(key('Space', true))
        expect(send.mock.calls.filter(([message]) => message.type === 'dash')).toHaveLength(1)
        controls.observe(
            characterFixture('hero', {
                movement: { mode: 'walking', dashing: true, dashCooldownMsLeft: 2500 },
            })
        )
        controls.release()
        expect(send).toHaveBeenLastCalledWith({ type: 'movement_mode', mode: 'walking' })
        const noOp = () => undefined
        const handled = handleRuntimeShortcut(key('KeyQ'), {
            pickup: noOp,
            inventory: noOp,
            context: undefined,
        })
        expect(handled).toBe(false)
    })
})

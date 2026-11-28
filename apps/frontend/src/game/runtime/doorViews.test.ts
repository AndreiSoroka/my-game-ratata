import type { DoorState, WorldObjectSnapshot } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { DoorViews } from './doorViews'

const TestActor = vi.hoisted(
    () =>
        class {
            public readonly graphics = { isVisible: true, use: vi.fn<(graphic: unknown) => void>() }
            public readonly kill = vi.fn<() => void>()
        }
)
vi.mock('excalibur', () => ({
    Actor: TestActor,
    Canvas: class {},
    vec: (x: number, y: number) => ({ x, y }),
}))

function setup() {
    const add = vi.fn<(actor: InstanceType<typeof TestActor>) => void>()
    return { add, views: new DoorViews({ add } as unknown as Engine) }
}

function door(state: DoorState): WorldObjectSnapshot {
    return {
        id: 'door',
        kind: 'door',
        name: 'Door',
        bounds: { x: 64, y: 64, width: 16, height: 16 },
        position: { x: 72, y: 72 },
        depleted: false,
        door: { state },
    }
}

it('keeps one closed-looking door beyond sight and shows its current state when seen', () => {
    const { add, views } = setup()
    const hidden = () => false
    const visible = () => true
    const openDoor = door('open')

    views.update([openDoor], hidden)
    const actor = add.mock.calls[0]![0]
    const { use } = actor.graphics
    const closed = use.mock.lastCall![0]
    expect(actor.graphics.isVisible).toBe(true)

    views.update([openDoor], visible)
    const open = use.mock.lastCall![0]
    expect(open).not.toBe(closed)

    views.update([openDoor], hidden)
    expect(use.mock.lastCall![0]).toBe(closed)
    expect(actor.graphics.isVisible).toBe(true)
    expect(openDoor.door?.state).toBe('open')

    views.update([door('closed')], visible)
    expect(use).toHaveBeenCalledTimes(3)
    expect(use.mock.lastCall![0]).toBe(closed)

    views.update([door('locked')], visible)
    const locked = use.mock.lastCall![0]
    expect(locked).not.toBe(closed)
    expect(locked).not.toBe(open)

    views.update([door('locked')], hidden)
    expect(use.mock.lastCall![0]).toBe(closed)
    expect(add).toHaveBeenCalledOnce()
})

it('clears actors on map changes and leaves doors already drawn in the facade alone', () => {
    const { add, views } = setup()
    const hidden = () => false
    const lockedDoor = door('locked')

    views.update([lockedDoor], hidden)
    const actor = add.mock.calls[0]![0]

    views.setMap(new Set([lockedDoor.id]))
    views.update([lockedDoor], hidden)
    views.update([lockedDoor], () => true)
    expect(actor.kill).toHaveBeenCalledOnce()
    expect(add).toHaveBeenCalledOnce()

    views.setMap(new Set())
    views.update([lockedDoor], hidden)
    expect(add).toHaveBeenCalledTimes(2)
})

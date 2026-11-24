import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import type { MapVisibility } from './mapVisibility'
import { SceneCharacterViews } from './sceneCharacterViews'

const graphics = vi.hoisted(() => ({
    update: vi.fn<(body: unknown, snapshot: CharacterSnapshot, time: number) => void>(),
}))
vi.mock('./characterGraphics', () => ({
    CharacterGraphics: class {
        public update = graphics.update
    },
}))
vi.mock('./damageFeedback', () => ({
    DamageFeedback: class {
        public elapsed = () => undefined
        public clear = vi.fn<() => void>()
        public dispose = vi.fn<() => void>()
        public forget = vi.fn<() => void>()
        public show = vi.fn<() => void>()
    },
}))
vi.mock('excalibur', () => ({
    Actor: class {
        public pos = { x: 0, y: 0 }
        public z = 0
        public graphics = { use: vi.fn<() => void>(), isVisible: true, opacity: 1 }
    },
    Label: class {
        public text = ''
        public pos = { x: 0, y: 0 }
        public z = 0
        public graphics = { isVisible: true, opacity: 1 }
    },
    Font: class {},
    Rectangle: class {},
    Color: { White: 'white', Green: 'green', Red: 'red', fromHex: (hex: string) => hex },
    vec: (x: number, y: number) => ({ x, y }),
}))

interface FakeActor {
    pos: { x: number; y: number }
    z: number
}
function setup() {
    let time = 0
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const handlers = new Map<string, () => void>()
    const actors: FakeActor[] = []
    const removed = vi.fn<(id: string) => void>()
    const placed = vi.fn<() => void>()
    const off = vi.fn<(name: string, handler: () => void) => void>((name) => {
        handlers.delete(name)
    })
    const remove = vi.fn<(actor: FakeActor) => void>()
    const engine = {
        add: (actor: FakeActor) => actors.push(actor),
        remove,
        on: (name: string, handler: () => void) => handlers.set(name, handler),
        off,
    } as unknown as Engine
    const views = new SceneCharacterViews(engine, new Map(), removed, placed)
    views.setMap({
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
    } as MapVisibility)
    const actor = characterFixture('npc', {
        position: { x: 80, y: 80 },
        velocity: { x: 5, y: 0 },
        animation: { action: 'walk', startedAt: 1000 },
    })
    views.sync({ ...worldFixture([actor], 1000), stepMs: 50 }, undefined, () => true)
    return {
        views,
        actors,
        removed,
        placed,
        off,
        remove,
        frame: (now: number) => {
            time = now
            handlers.get('preupdate')?.()
        },
    }
}
afterEach(() => {
    vi.restoreAllMocks()
    graphics.update.mockClear()
})

describe('scene character presentation scheduling', () => {
    it('moves body, name, health and sort keys together before camera callbacks and freezes after 200 ms', () => {
        const { views, actors, frame, placed } = setup()
        try {
            frame(50)
            expect(actors[0]?.pos).toEqual({ x: 85, y: 80 })
            expect(actors[1]?.pos).toEqual({ x: 85, y: 36 })
            expect(actors[2]?.pos).toEqual({ x: 69, y: 48 })
            expect(actors[3]?.pos).toEqual({ x: 69, y: 48 })
            expect(placed).toHaveBeenCalledOnce()
            frame(500)
            expect(views.position('npc')).toEqual({ x: 100, y: 80 })
            expect(graphics.update.mock.lastCall?.[1].animation.action).toBe('idle')
            const copied = views.rendered()
            copied[0]!.position.x = 999
            expect(views.position('npc')?.x).toBe(100)
        } finally {
            views.dispose()
        }
    })
    it('clears hidden/resumed motion, lost characters and subscriptions on disposal', () => {
        const { views, frame, actors, removed, off, remove } = setup()
        frame(50)
        document.dispatchEvent(new Event('visibilitychange'))
        frame(200)
        expect(actors[0]?.pos.x).toBe(85)
        expect(graphics.update.mock.lastCall?.[1].animation.action).toBe('idle')
        views.sync({ ...worldFixture([], 1100), tick: 3, stepMs: 50 }, undefined, () => true)
        expect(removed).toHaveBeenCalledWith('npc')
        expect(remove).toHaveBeenCalledTimes(4)
        views.dispose()
        views.dispose()
        expect(off).toHaveBeenCalledExactlyOnceWith('preupdate', expect.any(Function))
    })

    it('dims only other names and applies the focus to newly rendered characters', () => {
        const { views } = setup()
        const npc = characterFixture('npc')
        const other = characterFixture('other')
        const hero = characterFixture('hero')
        const deceased = characterFixture('deceased', { alive: false })
        try {
            views.sync(worldFixture([npc, other, hero], 1050), hero.id, () => true)
            views.setNameFocus(npc.id)
            expect(views.nameOpacity(npc.id)).toBe(1)
            expect(views.nameOpacity(other.id)).toBe(0.35)
            expect(views.nameOpacity(hero.id)).toBe(0)
            expect(views.body(other.id)?.graphics.opacity).toBe(1)

            views.sync(worldFixture([npc, other, hero, deceased], 1100), hero.id, () => true)
            expect(views.nameOpacity(deceased.id)).toBeCloseTo(0.55 * 0.35)
            views.setNameFocus(other.id)
            expect(views.nameOpacity(other.id)).toBe(1)
            expect(views.nameOpacity(npc.id)).toBe(0.35)

            views.setNameFocus(undefined)
            expect(views.nameOpacity(npc.id)).toBe(1)
            expect(views.nameOpacity(deceased.id)).toBe(0.55)
        } finally {
            views.dispose()
        }
    })

    it('restores visible labels when the focused character disappears or is hidden', () => {
        const { views } = setup()
        const npc = characterFixture('npc')
        const other = characterFixture('other')
        try {
            views.sync(worldFixture([npc, other], 1050), undefined, () => true)
            views.setNameFocus(npc.id)
            views.sync(worldFixture([other], 1100), undefined, () => true)
            expect(views.nameOpacity(other.id)).toBe(1)

            views.sync(worldFixture([npc, other], 1150), undefined, () => true)
            views.setNameFocus(npc.id)
            views.sync(worldFixture([npc, other], 1200), undefined, (actor) => actor.id !== npc.id)
            expect(views.nameOpacity(npc.id)).toBeUndefined()
            expect(views.nameOpacity(other.id)).toBe(1)
        } finally {
            views.dispose()
        }
    })
})

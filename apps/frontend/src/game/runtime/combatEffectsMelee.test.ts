import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { CombatEffects } from './combatEffects'

interface View {
    pos: { x: number; y: number }
    rotation: number
    killed: boolean
}
const state = vi.hoisted(() => ({ views: [] as View[] }))
vi.mock('excalibur', () => {
    class Actor {
        public pos: { x: number; y: number }
        public rotation: number
        public killed = false
        public graphics = { use: vi.fn<() => void>(), anchor: undefined }
        public actions = { fade: vi.fn<() => void>(), clearActions: vi.fn<() => void>() }
        public constructor(options: { pos: { x: number; y: number }; rotation?: number }) {
            this.pos = options.pos
            this.rotation = options.rotation ?? 0
            state.views.push(this)
        }
        public kill(): void {
            this.killed = true
        }
        public isKilled(): boolean {
            return this.killed
        }
    }
    return {
        Actor,
        Label: Actor,
        Canvas: class {},
        Font: class {},
        Color: { fromHex: (color: string) => color, Black: 'black' },
        vec: (x: number, y: number) => ({ x, y }),
    }
})
vi.mock('./combatParticles', () => ({
    CombatParticles: class {
        public burst = vi.fn<() => void>()
        public release = vi.fn<() => void>()
        public update = vi.fn<() => void>()
        public clear = vi.fn<() => void>()
    },
}))
function setup(characters: CharacterSnapshot[], reduced: boolean) {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
    let tick: ((event: { elapsed: number }) => void) | undefined
    const engine = {
        add: vi.fn<() => void>(),
        on: (_: string, handler: (event: { elapsed: number }) => void) => {
            tick = handler
        },
        off: vi.fn<() => void>(),
    } as unknown as Engine
    const effects = new CombatEffects(engine, (id) => characters.find((actor) => actor.id === id))
    return { effects, frame: (elapsed: number) => tick?.({ elapsed }) }
}
afterEach(() => {
    state.views.length = 0
    vi.unstubAllGlobals()
})

describe.each([false, true])('melee presentation with reduced motion %s', (reduced) => {
    it.each([undefined, 'skeleton_strike'] as const)(
        'pins %s to its initial origin and target heading',
        (abilityId) => {
            const from = characterFixture('attacker', { position: { x: 50, y: 50 }, facing: 'up' })
            const target = characterFixture('target', { position: { x: 30, y: 50 } })
            const { effects, frame } = setup([from, target], reduced)
            try {
                effects.receive({
                    kind: 'attack',
                    actorId: from.id,
                    targetId: target.id,
                    abilityId,
                })
                const view = state.views[0]!
                expect(view.pos).toEqual({ x: 50, y: 50 })
                expect(view.rotation).toBe(Math.PI)
                from.position = { x: 80, y: 80 }
                from.facing = 'right'
                target.position = { x: 100, y: 50 }
                frame(100)
                expect(view.pos).toEqual({ x: 50, y: 50 })
                expect(view.rotation).toBe(Math.PI)
                expect(view.killed).toBe(false)
                frame(600)
                expect(view.killed).toBe(true)
            } finally {
                effects.dispose()
            }
        }
    )
})

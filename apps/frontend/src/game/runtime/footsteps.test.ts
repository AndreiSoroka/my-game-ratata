import type { ProgressionSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { footstepGain, FootstepPlanner, type WalkingActor } from './footsteps'
import { readFootstepMap, surfaceAt } from './mapSurfaces'

function walker(id: string, x: number, moving = true): WalkingActor {
    return {
        id,
        alive: true,
        archetype: 'human',
        position: { x, y: 8 },
        velocity: { x: moving ? 90 : 0, y: 0 },
    }
}

describe('audible footsteps', () => {
    it('uses each walker surface and makes distant footsteps quieter independently', () => {
        const planner = new FootstepPlanner()
        const ground = (point: { x: number }) =>
            point.x < 100 ? ('grass' as const) : ('stone' as const)
        planner.collect(
            [walker('listener', 0, false), walker('near', 30), walker('far', 150)],
            'listener',
            0,
            ground
        )
        const steps = planner.collect(
            [walker('listener', 0, false), walker('near', 60), walker('far', 180)],
            'listener',
            300,
            ground
        )
        expect(steps).toHaveLength(2)
        expect(steps[0]).toMatchObject({ actorId: 'near', surface: 'grass' })
        expect(steps[1]).toMatchObject({ actorId: 'far', surface: 'stone' })
        expect(steps[0]?.volume).toBeGreaterThan(steps[1]?.volume ?? 1)
        expect(footstepGain(0)).toBe(1)
        expect(footstepGain(240)).toBe(0)
        expect(footstepGain(500)).toBe(0)
    })

    it('requires actual movement, suppressing blocked actors, dead actors and teleports', () => {
        const planner = new FootstepPlanner()
        const ground = () => 'stone' as const
        const actors = [
            walker('listener', 0, false),
            walker('blocked', 40),
            walker('teleport', 50),
            walker('dead', 80),
            walker('far', 350),
        ]
        planner.collect(actors, 'listener', 0, ground)
        const next = [
            actors[0]!,
            actors[1]!,
            walker('teleport', 150),
            { ...walker('dead', 110), alive: false },
            walker('far', 380),
        ]
        expect(planner.collect(next, 'listener', 300, ground)).toEqual([])
    })

    it('emits local steps at a stride cadence and clears old location history', () => {
        const planner = new FootstepPlanner()
        const ground = () => 'wood' as const
        expect(planner.collect([walker('me', 0)], 'me', 0, ground)).toEqual([])
        expect(planner.collect([walker('me', 10)], 'me', 100, ground)).toEqual([])
        expect(planner.collect([walker('me', 30)], 'me', 300, ground)).toHaveLength(1)
        expect(planner.collect([walker('me', 30, false)], 'me', 600, ground)).toEqual([])
        planner.reset()
        expect(planner.collect([walker('me', 50)], 'me', 900, ground)).toEqual([])
    })

    it('reads authored surface metadata without depending on a particular atlas GID', () => {
        const map = readFootstepMap({
            width: 2,
            height: 2,
            tilewidth: 16,
            tileheight: 16,
            layers: [
                {
                    name: 'Footstep surfaces',
                    data: [11, 22, 33, 44],
                    properties: [
                        { name: 'surface.11', value: 'grass' },
                        { name: 'surface.22', value: 'stone' },
                        { name: 'surface.33', value: 'wood' },
                        { name: 'surface.44', value: 'dirt' },
                    ],
                },
            ],
        })
        expect(surfaceAt(map, { x: 8, y: 8 })).toBe('grass')
        expect(surfaceAt(map, { x: 24, y: 8 })).toBe('stone')
        expect(surfaceAt(map, { x: 8, y: 24 })).toBe('wood')
        expect(surfaceAt(map, { x: 24, y: 24 })).toBe('dirt')
        expect(surfaceAt(map, { x: -8, y: 24 })).toBe('grass')
    })
})

describe('walking bouts', () => {
    it('sounds a short one-tile NPC walk even when its arrival snapshot has stopped velocity', () => {
        const planner = new FootstepPlanner()
        const ground = () => 'grass' as const
        planner.collect(
            [walker('listener', 0, false), walker('wanderer', 30)],
            'listener',
            0,
            ground
        )
        const arrival = planner.collect(
            [walker('listener', 0, false), walker('wanderer', 46, false)],
            'listener',
            180,
            ground
        )
        expect(arrival).toHaveLength(1)
        expect(arrival[0]?.actorId).toBe('wanderer')
        expect(
            planner.collect(
                [walker('listener', 0, false), walker('wanderer', 46, false)],
                'listener',
                230,
                ground
            )
        ).toEqual([])
        expect(
            planner.collect(
                [walker('listener', 0, false), walker('wanderer', 58)],
                'listener',
                360,
                ground
            )
        ).toHaveLength(1)
    })

    it('uses an early first step, then normal stride cadence without making wall-shuffle sounds', () => {
        const planner = new FootstepPlanner()
        const ground = () => 'stone' as const
        planner.collect([walker('me', 0)], 'me', 0, ground)
        expect(planner.collect([walker('me', 12)], 'me', 120, ground)).toHaveLength(1)
        expect(planner.collect([walker('me', 24)], 'me', 240, ground)).toEqual([])
        expect(planner.collect([walker('me', 38)], 'me', 360, ground)).toHaveLength(1)
        expect(planner.collect([walker('me', 50)], 'me', 480, ground)).toEqual([])
        expect(planner.collect([walker('me', 64)], 'me', 600, ground)).toHaveLength(1)
        for (const now of [750, 900, 1050]) {
            expect(planner.collect([walker('me', 64)], 'me', now, ground)).toEqual([])
        }
    })
})

describe('movement noise presentation', () => {
    it('makes sneaking quiet locally and inaudible to distant listeners while dashing carries farther', () => {
        function steps(mode: 'walking' | 'sneaking', listener = 'me', dashing = false) {
            const planner = new FootstepPlanner()
            const actors = (x: number) => [
                walker('listener', 150, false),
                {
                    ...walker('me', x),
                    movement: { mode, dashCooldownMsLeft: 0, dashing },
                },
            ]
            planner.collect(actors(0), listener, 0, () => 'grass')
            return planner.collect(actors(12), listener, 200, () => 'grass')
        }
        expect(steps('sneaking')[0]!.volume).toBeLessThan(steps('walking')[0]!.volume)
        expect(steps('sneaking', 'listener')).toEqual([])
        expect(steps('walking', 'listener', true)[0]!.volume).toBeGreaterThan(
            steps('walking', 'listener')[0]!.volume
        )
    })
})

describe('learned stealth audio', () => {
    it('makes mastered footsteps quieter at the same distance without changing ordinary walking', () => {
        const volume = (level: number, mode: 'sneaking' | 'walking') => {
            const planner = new FootstepPlanner()
            const actor = (x: number): WalkingActor => ({
                ...walker('me', x),
                movement: { mode, dashCooldownMsLeft: 0, dashing: false },
                progression: { skills: [{ id: 'stealth', level }] } as ProgressionSnapshot,
            })
            planner.collect([actor(0)], 'me', 0, () => 'grass')
            return planner.collect([actor(12)], 'me', 200, () => 'grass')[0]!.volume
        }
        expect(volume(10, 'sneaking')).toBeGreaterThan(0)
        expect(volume(10, 'sneaking')).toBeLessThan(volume(1, 'sneaking'))
        expect(volume(10, 'walking')).toEqual(volume(1, 'walking'))
    })
})

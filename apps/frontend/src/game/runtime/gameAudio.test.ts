import type {
    CharacterSnapshot,
    FootstepSourceSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Footstep } from './footsteps'
import { GameAudio } from './gameAudio'
import type { FootstepMap } from './mapSurfaces'

const audio = vi.hoisted(() => ({
    play: vi.fn<(step: Footstep) => void>(),
    stop: vi.fn<() => void>(),
}))
vi.mock('./footstepAudio', () => ({
    FootstepAudio: class {
        public play = audio.play
        public stop = audio.stop
    },
}))
const map: FootstepMap = {
    width: 12,
    height: 1,
    tileWidth: 16,
    tileHeight: 16,
    surfaces: Array.from({ length: 12 }, () => 'wood'),
}
function snapshot(x: number, alive = true, present = true): WorldSnapshot {
    const character = {
        id: 'hero',
        archetype: 'human',
        creatureType: 'humanoid',
        alive,
        position: { x, y: 8 },
        velocity: { x: 90, y: 0 },
    } as CharacterSnapshot
    return { characters: present ? [character] : [] } as unknown as WorldSnapshot
}
function setup(): GameAudio {
    const music = {
        play: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
        stop: vi.fn<() => void>(),
    } as unknown as Sound
    const player = new GameAudio(new Map(), music)
    player.setMap({ footsteps: map })
    audio.stop.mockClear()
    return player
}
afterEach(() => {
    vi.restoreAllMocks()
    audio.play.mockClear()
    audio.stop.mockClear()
})

describe('footstep audio lifecycle', () => {
    it('keeps a walking stride audible across viewport entry and exit without adding duplicate character views', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0)
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
        const player = setup()
        const listener = snapshot(8).characters[0]!
        listener.velocity = { x: 0, y: 0 }
        const walker = (x: number): FootstepSourceSnapshot => ({
            id: 'outside-view',
            alive: true,
            archetype: 'human',
            position: { x, y: 8 },
            velocity: { x: 90, y: 0 },
        })
        const world: WorldSnapshot = {
            ...snapshot(8),
            characters: [listener],
            footstepSources: [walker(60)],
        }
        try {
            player.observeWorld(world, 'hero')
            now.mockReturnValue(300)
            world.footstepSources = [walker(90)]
            player.observeWorld(world, 'hero')
            expect(audio.play).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    actorId: 'outside-view',
                    surface: 'wood',
                })
            )
            expect(world.characters).toEqual([listener])

            now.mockReturnValue(600)
            world.characters = [listener, walker(120) as CharacterSnapshot]
            player.observeWorld(world, 'hero')
            expect(audio.play).toHaveBeenCalledTimes(2)

            now.mockReturnValue(900)
            world.characters = [listener]
            world.footstepSources = [walker(150)]
            player.observeWorld(world, 'hero')
            expect(audio.play).toHaveBeenCalledTimes(3)
            expect(world.characters).toEqual([listener])
        } finally {
            player.stop()
        }
    })
    it('stops active steps on death or missing listener and retains the map for revival', () => {
        const now = vi.spyOn(performance, 'now')
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
        const player = setup()
        try {
            now.mockReturnValue(0)
            player.observeWorld(snapshot(8), 'hero')
            now.mockReturnValue(300)
            player.observeWorld(snapshot(38), 'hero')
            expect(audio.play).toHaveBeenCalledWith(expect.objectContaining({ surface: 'wood' }))
            player.observeWorld(snapshot(38, false), 'hero')
            expect(audio.stop).toHaveBeenCalledOnce()
            now.mockReturnValue(400)
            player.observeWorld(snapshot(38), 'hero')
            now.mockReturnValue(700)
            player.observeWorld(snapshot(68), 'hero')
            expect(audio.play).toHaveBeenCalledTimes(2)
            player.observeWorld(snapshot(68, true, false), 'hero')
            expect(audio.stop).toHaveBeenCalledTimes(2)
            now.mockReturnValue(800)
            player.observeWorld(snapshot(68), 'hero')
            now.mockReturnValue(1100)
            player.observeWorld(snapshot(98), 'hero')
            expect(audio.play).toHaveBeenCalledTimes(3)
        } finally {
            player.stop()
        }
    })
    it('clears stride and voices on hide, resumes using the same map, and removes its listener on stop', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0)
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
        const player = setup()
        player.observeWorld(snapshot(8), 'hero')
        hidden.mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
        expect(audio.stop).toHaveBeenCalledOnce()
        now.mockReturnValue(300)
        player.observeWorld(snapshot(38), 'hero')
        expect(audio.play).not.toHaveBeenCalled()
        hidden.mockReturnValue(false)
        document.dispatchEvent(new Event('visibilitychange'))
        player.observeWorld(snapshot(38), 'hero')
        now.mockReturnValue(600)
        player.observeWorld(snapshot(68), 'hero')
        expect(audio.play).toHaveBeenCalledWith(expect.objectContaining({ surface: 'wood' }))
        player.stop()
        audio.stop.mockClear()
        hidden.mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
        expect(audio.stop).not.toHaveBeenCalled()
    })
    it('suppresses old-map steps while loading and accepts a new map without carrying a stride across it', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(0)
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
        const player = setup()
        try {
            player.observeWorld(snapshot(8), 'hero')
            player.suspendWorld()
            now.mockReturnValue(300)
            player.observeWorld(snapshot(38), 'hero')
            expect(audio.play).not.toHaveBeenCalled()
            player.setMap({
                footsteps: { ...map, surfaces: Array.from({ length: 12 }, () => 'stone') },
            })
            player.observeWorld(snapshot(38), 'hero')
            expect(audio.play).not.toHaveBeenCalled()
            now.mockReturnValue(600)
            player.observeWorld(snapshot(68), 'hero')
            expect(audio.play).toHaveBeenCalledWith(expect.objectContaining({ surface: 'stone' }))
        } finally {
            player.stop()
        }
    })
})

it('restores the current surface map when pending travel is cancelled without a map replacement', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const player = setup()
    try {
        player.observeWorld(snapshot(8), 'hero')
        player.suspendWorld()
        now.mockReturnValue(300)
        player.observeWorld(snapshot(38), 'hero')
        now.mockReturnValue(600)
        player.observeWorld(snapshot(68), 'hero')
        expect(audio.play).not.toHaveBeenCalled()

        player.resumeWorld()
        player.observeWorld(snapshot(68), 'hero')
        expect(audio.play).not.toHaveBeenCalled()
        now.mockReturnValue(900)
        player.observeWorld(snapshot(98), 'hero')
        expect(audio.play).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ surface: 'wood' })
        )
    } finally {
        player.stop()
    }
})

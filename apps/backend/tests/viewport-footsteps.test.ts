import {
    type CharacterSnapshot,
    type SetViewportClientMessage,
    WORLD_LOCATION_DEFINITIONS,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createCharacterSnapshot } from '../src/game/characterSnapshot'
import { viewportFootsteps } from '../src/game/viewportFootsteps'
import { projectViewport } from '../src/game/viewportProjection'

function character(id: string, x: number): CharacterSnapshot {
    return createCharacterSnapshot(
        new GameCharacter({
            id,
            nickname: id,
            locationId: 'map-2-2',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x, y: 150 },
        }),
        1000,
        false
    )
}

it('uses the same audible gait radii without restoring offscreen character details', () => {
    const self = character('self', 150)
    const walking = character('walking', 350)
    const dash = character('dash', 600)
    dash.movement = { mode: 'walking', dashing: true, dashCooldownMsLeft: 0 }
    const quiet = character('quiet', 250)
    quiet.movement = { mode: 'sneaking', dashing: false, dashCooldownMsLeft: 0 }
    const tooQuiet = character('too-quiet', 260)
    tooQuiet.movement = quiet.movement
    const far = character('far', 391)
    const dead = character('dead', 350)
    dead.alive = false
    const audible = viewportFootsteps(
        [self, walking, dash, quiet, tooQuiet, far, dead],
        [self],
        'self'
    )

    expect(audible.map(({ id }) => id)).toEqual(['walking', 'dash', 'quiet'])
    expect(Object.keys(audible[0] ?? {}).sort()).toEqual([
        'alive',
        'archetype',
        'id',
        'movement',
        'position',
        'velocity',
    ])
    expect(audible[0]).not.toHaveProperty('inventory')
    expect(audible[0]).not.toHaveProperty('progression')
    expect(audible[0]).not.toHaveProperty('health')
})

it('keeps visible actors unique and requires a living authorized listener', () => {
    const self = character('self', 150)
    const walker = character('walker', 350)
    expect(viewportFootsteps([self, walker], [self, walker], 'self')).toEqual(
        []
    )
    expect(viewportFootsteps([walker], [], 'self')).toEqual([])
    self.alive = false
    expect(viewportFootsteps([self, walker], [self], 'self')).toEqual([])
})

it('adds compact authorized audio and expanded bounds to a cropped view', () => {
    const definition = WORLD_LOCATION_DEFINITIONS.find(
        ({ id }) => id === 'map-2-2'
    )
    if (definition === undefined) {
        throw new Error('Missing center map')
    }
    const self = character('self', 150)
    const walker = character('offscreen-walker', 350)
    const snapshot: WorldSnapshot = {
        serverTime: 1000,
        tick: 1,
        items: [],
        chests: [],
        characters: [self, walker],
        location: {
            ...definition,
            columns: 5,
            rows: 5,
            regionName: 'Region',
            map: {
                id: definition.id,
                asset: { url: '/map', revision: 'v1' },
                width: 100,
                height: 100,
                worldWidth: 1600,
                worldHeight: 1600,
                tileWidth: 16,
                tileHeight: 16,
                solidLayerNames: [],
            },
        },
        heardFootsteps: [
            { id: 1, position: { x: 400, y: 400 }, expiresAt: 2000 },
        ],
    }
    const hint: SetViewportClientMessage = {
        type: 'set_viewport',
        locationId: definition.id,
        bounds: { left: 100, top: 100, right: 200, bottom: 200 },
    }
    const cropped = projectViewport(snapshot, hint, 'self')

    expect(cropped.characters.map(({ id }) => id)).toEqual(['self'])
    expect(cropped.footstepSources?.map(({ id }) => id)).toEqual([
        'offscreen-walker',
    ])
    expect(cropped.viewBounds).toEqual({
        left: 85,
        top: 85,
        right: 215,
        bottom: 215,
    })
    expect(cropped.heardFootsteps).toBe(snapshot.heardFootsteps)
    expect(cropped.footstepSources?.[0]).not.toHaveProperty('nickname')
    expect(snapshot).not.toHaveProperty('viewBounds')
    expect(snapshot).not.toHaveProperty('footstepSources')
})

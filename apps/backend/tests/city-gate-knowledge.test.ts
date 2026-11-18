import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    npcCommandCapabilities,
    npcCommandProblem,
} from '../src/ai/commandValidation'
import { defaultNpcAiSettings } from '../src/ai/config'
import { knownGuidePlaces, resolveNpcGuideGoal } from '../src/ai/guideTargets'
import { characterKnowledge } from '../src/ai/knowledgeCatalog'
import { buildNpcAiObservation } from '../src/ai/observation'
import { createNpcAiState } from '../src/ai/runtimeState'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import { readMapLandmarks } from '../src/game/mapLandmarks'
import { NavigationService } from '../src/game/navigation'
import { regionalExit, regionalRoute } from '../src/game/regionalNavigation'
import { GameRoom } from '../src/game/room'
import { npcReply } from './npcAiRuntimeFixture'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

it('allows Mira to guide inside the city despite her separate refusal to follow into a journey', () => {
    const room = new GameRoom()
    try {
        const mira = room.getCharacter('npc_friendly_girl_1')
        if (mira === undefined) {
            throw new Error('Missing Mira')
        }
        const companions = new CompanionService()
        const state = createNpcAiState(
            {
                actorId: mira.id,
                role: 'city_coordinator',
                settings: defaultNpcAiSettings,
            },
            mira
        )
        const capabilities = npcCommandCapabilities(
            room,
            companions,
            state,
            1000
        )
        expect(capabilities?.canFollow).toBe(false)
        expect(capabilities?.movementScope).toBe('city')
        const gate = room
            .navigationFor(mira)
            .grid.landmarks?.find((entry) => entry.direction === 'west')
        if (gate === undefined) {
            throw new Error('Missing west gate')
        }
        expect(
            npcCommandProblem(
                room,
                companions,
                state,
                npcReply(
                    {
                        type: 'guide',
                        targetKey: `landmark:${mira.locationId}:${gate.id}`,
                    },
                    { taskAcceptance: 'accept' }
                ),
                1000
            )
        ).toBeUndefined()
        expect(
            npcCommandProblem(
                room,
                companions,
                state,
                npcReply(
                    { type: 'guide', targetKey: 'location:map-1-2' },
                    { taskAcceptance: 'accept' }
                ),
                1000
            )?.code
        ).toBe('command_unavailable')
    } finally {
        room.stop()
    }
})

it('connects authored gates to local knowledge and real guide targets without disclosing hidden people', () => {
    const room = new GameRoom()
    try {
        const mira = room.getCharacter('npc_friendly_girl_1')
        if (mira === undefined) {
            throw new Error('Missing Mira')
        }
        const navigation = room.navigationFor(mira)
        const gates =
            navigation.grid.landmarks?.filter(
                (entry) => entry.kind === 'gate'
            ) ?? []
        expect(gates).toHaveLength(4)
        const western = gates.find((entry) => entry.direction === 'west')
        if (western === undefined) {
            throw new Error('Missing west gate')
        }
        expect(western.destinationLocationId).toBe('map-1-2')
        const knowledge = characterKnowledge(mira, navigation).filter(
            (entry) => entry.landmarkId !== undefined
        )
        expect(knowledge).toHaveLength(4)
        expect(
            knowledge.find((entry) => entry.landmarkId === western.id)?.text
        ).toContain('Западные поля')
        const observation = buildNpcAiObservation(
            room,
            mira,
            'city_coordinator',
            1000
        )
        const target = observation.targets.find(
            (entry) =>
                entry.kind === 'landmark' && entry.name === 'Западные ворота'
        )
        expect(target?.commands).toContainEqual({
            type: 'guide',
            targetKey: target?.key,
        })
        expect(
            resolveNpcGuideGoal(room, mira, target?.key ?? '')?.position
        ).toEqual(western.position)
        expect(
            observation.knownPlaces?.some(
                (place) =>
                    place.key === 'location:map-1-2' &&
                    place.direction.includes('западу')
            )
        ).toBe(true)
        expect(
            observation.knownPlaces?.every((place) => !('position' in place))
        ).toBe(true)
        expect(
            observation.knownPlaces?.some((place) =>
                place.key.includes('npc_princess')
            )
        ).toBe(false)
        const visitor = new GameCharacter({
            id: 'visitor',
            nickname: 'Visitor',
            archetype: 'human',
            controllerKind: 'scripted',
            faction: 'peaceful',
            spawnPosition: { x: 776, y: 648 },
        })
        expect(
            characterKnowledge(visitor, navigation).some(
                (entry) => entry.landmarkId !== undefined
            )
        ).toBe(false)
        expect(
            knownGuidePlaces(visitor, navigation).some(
                (place) => place.kind === 'landmark'
            )
        ).toBe(false)
        visitor.position = { ...western.position }
        expect(
            knownGuidePlaces(visitor, navigation).some(
                (place) => place.name === 'Западные ворота'
            )
        ).toBe(true)
    } finally {
        room.stop()
    }
})

it('validates stable gate references and prevents malformed or nonadjacent destinations', () => {
    const object = {
        id: 1,
        name: 'West gate',
        type: 'landmark',
        x: 24,
        y: 24,
        properties: [
            { name: 'kind', value: 'gate' },
            { name: 'direction', value: 'west' },
            { name: 'destinationLocationId', value: 'map-1-2' },
        ],
    }
    const map = (objects = [object]) => ({
        width: 10,
        height: 10,
        tilewidth: 16,
        tileheight: 16,
        layers: [{ type: 'objectgroup', objects }],
    })
    expect(readMapLandmarks(map(), 'map-2-2')[0]?.direction).toBe('west')
    expect(() => readMapLandmarks(map([object, object]), 'map-2-2')).toThrow(
        /duplicate/u
    )
    expect(() =>
        readMapLandmarks(map([{ ...object, x: Infinity }]), 'map-2-2')
    ).toThrow(/Invalid/u)
    expect(() =>
        readMapLandmarks(
            map([
                {
                    ...object,
                    properties: object.properties.map((property) =>
                        property.name === 'destinationLocationId'
                            ? { ...property, value: 'map-0-0' }
                            : property
                    ),
                },
            ]),
            'map-2-2'
        )
    ).toThrow(/destination/u)
})

it('selects a reachable exit on the requested side and never falls through another border or corner', () => {
    const navigation = new NavigationService({
        id: 'exit-test',
        width: 8,
        height: 8,
        tileWidth: 12,
        tileHeight: 20,
        solidLayerNames: [],
        solid: Array<boolean>(64).fill(false),
    })
    const from = navigation.tileToWorld({ x: 4, y: 4 })
    const exit = regionalExit(from, 'map-2-2', 'map-1-2', navigation)
    expect(exit?.point.x).toBe(6)
    expect(exit?.point.y).toBeGreaterThan(10)
    expect(exit?.point.y).toBeLessThan(150)
    for (let y = 1; y < 7; y++) {
        navigation.grid.solid[y * 8] = true
    }
    expect(regionalExit(from, 'map-2-2', 'map-1-2', navigation)).toBeUndefined()
    expect(regionalExit(from, 'map-2-2', 'map-0-0', navigation)).toBeUndefined()
    expect(regionalRoute('map-2-2', 'map-0-2')).toEqual([
        'map-2-2',
        'map-1-2',
        'map-0-2',
    ])
    expect(regionalRoute('map-2-2', 'missing')).toBeUndefined()
})

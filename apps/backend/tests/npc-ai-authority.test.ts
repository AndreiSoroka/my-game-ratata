import { describe, expect, it, vi } from 'vitest'

import {
    applyAgentDecision,
    type CompanionWorld,
    parseAgentDecision,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import {
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { CompanionService } from '../src/game/companions'
import { NavigationService } from '../src/game/navigation'

function character(id: string, human = false): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: human ? 'network_player' : 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
    })
}

function fixture() {
    const actor = character('npc')
    const recipient = character('recipient', true)
    recipient.position.x = 112
    const stranger = character('stranger', true)
    const service = new CompanionService()
    const characters = new Map(
        [actor, recipient, stranger].map((entry) => [entry.id, entry])
    )
    const navigation = new NavigationService({
        id: 'model-authority',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const world: CompanionWorld = {
        getCharacter: (id) => characters.get(id),
        navigationFor: () => navigation,
        requestAttack: vi.fn(),
        findVisibleTarget: () => undefined,
        requestControl: (actor, command, now) =>
            setCharacterControl(actor, command, world, now),
    }
    return { actor, recipient, stranger, service, world, navigation }
}

describe('actor-bound model runtime control', () => {
    it('keeps an exclusive Spark alive across slow inference and leaves legacy callers unable to overwrite it', () => {
        const f = fixture()
        expect(f.service.claimModelControl(f.actor, 'session-a', 1000)).toBe(
            true
        )
        expect(f.service.claimModelControl(f.actor, 'session-b', 1000)).toBe(
            false
        )
        expect(f.service.blocksScenario(f.actor, 1000)).toBe(true)
        expect(f.actor.soul).toMatchObject({
            kind: 'spark',
            controlSource: 'model',
        })
        expect(
            f.service.decide(
                f.actor,
                { type: 'move', axis: { x: 1, y: 0 } },
                f.world,
                1000
            ).accepted
        ).toBe(false)
        for (const now of [5000, 9000, 13_000]) {
            expect(f.service.renewModelControl(f.actor, 'session-a', now)).toBe(
                true
            )
            expect(f.service.blocksScenario(f.actor, now)).toBe(true)
        }
        expect(
            f.service.decide(
                f.actor,
                { type: 'wait' },
                f.world,
                13_001,
                'session-a'
            ).accepted
        ).toBe(true)
        expect(f.service.blocksScenario(f.actor, 13_002)).toBe(true)
    })

    it('clears the actual shared route at expiry even when no world was supplied to the ownership check', () => {
        const f = fixture()
        f.service.claimModelControl(f.actor, 'session-a', 1000)
        expect(
            f.service.decide(
                f.actor,
                { type: 'move_to', target: { x: 240, y: 80 } },
                f.world,
                1000,
                'session-a'
            ).accepted
        ).toBe(true)
        expect(snapshotControl(f.actor).mode).toBe('route')
        expect(f.service.isModelControlOwner(f.actor, 'session-a', 6000)).toBe(
            false
        )
        expect(snapshotControl(f.actor).mode).toBe('none')
        expect(f.actor.hasPath()).toBe(false)
        expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
        expect(f.actor.soul.kind).toBe('echo')
        expect(f.service.renewModelControl(f.actor, 'session-a', 6000)).toBe(
            false
        )
    })

    it('rejects stale commands and releases without disrupting a replacement session', () => {
        const f = fixture()
        f.service.claimModelControl(f.actor, 'session-a', 1000)
        f.service.releaseModelControl(f.actor, 'session-a', f.world, 1001)
        expect(f.service.claimModelControl(f.actor, 'session-b', 1002)).toBe(
            true
        )
        f.service.releaseModelControl(f.actor, 'session-a', f.world, 1003)
        expect(
            f.service.decide(
                f.actor,
                { type: 'speak', text: 'Old output' },
                f.world,
                1003,
                'session-a'
            ).accepted
        ).toBe(false)
        expect(f.service.isModelControlOwner(f.actor, 'session-b', 1003)).toBe(
            true
        )
    })

    it('does not steal an accepted legacy bridge lease', () => {
        const f = fixture()
        expect(
            f.service.decide(f.actor, { type: 'wait' }, f.world, 1000).accepted
        ).toBe(true)
        f.service.decide(
            f.actor,
            { type: 'move', axis: { x: 1, y: 0 } },
            f.world,
            1001
        )
        expect(f.service.claimModelControl(f.actor, 'runtime', 1002)).toBe(
            false
        )
        expect(f.actor.getMoveInput()).toEqual({ x: 1, y: 0 })
        expect(f.service.claimModelControl(f.actor, 'runtime', 6001)).toBe(true)
        expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    })
})

describe('model-control lifecycle boundaries', () => {
    it.each(['human', 'dead', 'offline', 'retired', 'training'] as const)(
        'rejects an unavailable character at claim: %s',
        (reason) => {
            const f = fixture()
            const actor =
                reason === 'training'
                    ? new GameCharacter({
                          id: 'dummy',
                          nickname: 'Dummy',
                          archetype: 'human',
                          controllerKind: 'scripted',
                          trainingTarget: { areaId: 'training' },
                          spawnPosition: f.actor.position,
                      })
                    : reason === 'human'
                      ? f.recipient
                      : f.actor
            if (reason === 'human') {
                actor.connected = false
                actor.soul.controlSource = 'script'
            }
            if (reason === 'dead') {
                actor.alive = false
            }
            if (reason === 'offline') {
                actor.tags.add('offline')
            }
            if (reason === 'retired') {
                actor.tags.add('state.retired')
            }
            expect(f.service.claimModelControl(actor, 'runtime', 1000)).toBe(
                false
            )
        }
    )

    it('revokes the old incarnation after death and never resets a new human controller', () => {
        const f = fixture()
        f.service.claimModelControl(f.actor, 'before-death', 1000)
        f.actor.deathSequence += 1
        expect(f.service.renewModelControl(f.actor, 'before-death', 1001)).toBe(
            false
        )
        expect(f.service.claimModelControl(f.actor, 'after-death', 1002)).toBe(
            true
        )
        f.actor.soul.controlSource = 'human'
        f.actor.setMoveInput({ x: 1, y: 0 })
        expect(f.service.hasActiveLease(f.actor, 1003, f.world)).toBe(false)
        expect(f.actor.soul.controlSource).toBe('human')
        expect(f.actor.getMoveInput()).toEqual({ x: 1, y: 0 })
    })
})

describe('addressed model speech', () => {
    it('delivers a stable private speech receipt and keeps the cached reply server-side', () => {
        const f = fixture()
        const result = f.service.decide(
            f.actor,
            {
                type: 'speak',
                text: 'Принёс новости.',
                targetId: f.recipient.id,
            },
            f.world,
            1000
        )
        expect(result.accepted).toBe(true)
        expect(result.events).toEqual([
            expect.objectContaining({
                kind: 'chat',
                targetId: f.recipient.id,
                audienceIds: [f.recipient.id],
                speechId: 1,
            }),
        ])
        expect(f.actor.soul.companion?.lastReply).toBe('Принёс новости.')
        expect(f.actor.snapshot(1000).soul).not.toHaveProperty('companion')
        const publicSpeech = f.service.decide(
            f.actor,
            { type: 'speak', text: 'Всем добрый день.' },
            f.world,
            1001
        )
        expect(publicSpeech.events[0]?.speechId).toBe(2)
        expect(publicSpeech.events[0]?.audienceIds).toBeUndefined()
        expect(f.actor.soul.companion?.lastReply).toBe('Всем добрый день.')
        expect(f.actor.snapshot(1001).soul).not.toHaveProperty('companion')
    })

    it.each([
        'missing',
        'far',
        'location',
        'dead',
        'offline',
        'disconnected',
        'hidden',
    ] as const)(
        'rejects an invalid recipient without creating a receipt: %s',
        (reason) => {
            const f = fixture()
            if (reason === 'far') {
                f.recipient.position.x = 145
            }
            if (reason === 'location') {
                f.recipient.locationId = 'map-0-0'
            }
            if (reason === 'dead') {
                f.recipient.alive = false
            }
            if (reason === 'offline') {
                f.recipient.tags.add('offline')
            }
            if (reason === 'disconnected') {
                f.recipient.connected = false
            }
            if (reason === 'hidden') {
                vi.spyOn(f.navigation, 'hasLineOfSight').mockReturnValue(false)
            }
            expect(
                applyAgentDecision(
                    f.actor,
                    {
                        type: 'speak',
                        text: 'Secret',
                        targetId:
                            reason === 'missing' ? 'missing' : f.recipient.id,
                    },
                    f.world,
                    1000
                )
            ).toMatchObject({ accepted: false, events: [] })
            expect(f.actor.soul.companion).toBeNull()
        }
    )

    it('validates recipient syntax instead of falling back to public speech', () => {
        for (const targetId of ['', null, 42, 'x'.repeat(101)]) {
            expect(
                parseAgentDecision({ type: 'speak', text: 'Hello', targetId })
            ).toBeUndefined()
        }
        expect(parseAgentDecision({ type: 'speak', text: 'Hello' })).toEqual({
            type: 'speak',
            text: 'Hello',
        })
    })
})

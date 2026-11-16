import { describe, expect, it, vi } from 'vitest'

import type { CompanionWorld } from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import { NavigationService } from '../src/game/navigation'

function fixture() {
    const actor = new GameCharacter({
        id: 'npc',
        nickname: 'NPC',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
    })
    const service = new CompanionService()
    const navigation = new NavigationService({
        id: 'lease',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const world: CompanionWorld = {
        navigationFor: () => navigation,
        findVisibleTarget: () => undefined,
        getCharacter: () => actor,
        requestAttack: () => undefined,
        requestAutomation: vi.fn(() => ({
            accepted: true,
            error: null,
            events: [],
        })),
    }
    return { actor, service, world }
}

describe('model control and continuing shared scenarios', () => {
    it('renews a real model Spark for scenario edits without interrupting the scenario path at lease expiry', () => {
        const f = fixture()
        f.actor.setPath([{ x: 144, y: 80 }])
        expect(
            f.service.decide(f.actor, { type: 'marker_create' }, f.world, 1000)
                .accepted
        ).toBe(true)
        expect(f.actor.soul).toMatchObject({
            kind: 'spark',
            controlSource: 'model',
        })
        expect(f.service.hasActiveLease(f.actor, 5999)).toBe(true)
        expect(f.service.blocksScenario(f.actor, 5999)).toBe(false)
        expect(f.service.hasActiveLease(f.actor, 6000, f.world)).toBe(false)
        expect(f.actor.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
        expect(f.actor.hasPath()).toBe(true)
    })

    it('gives direct movement exclusive control until the deadline and releases immediately on wait', () => {
        const f = fixture()
        f.service.decide(
            f.actor,
            { type: 'move', axis: { x: 1, y: 0 } },
            f.world,
            1000
        )
        expect(f.service.blocksScenario(f.actor, 5999)).toBe(true)
        expect(f.service.blocksScenario(f.actor, 6000, f.world)).toBe(false)
        expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
        f.service.decide(
            f.actor,
            { type: 'move', axis: { x: -1, y: 0 } },
            f.world,
            7000
        )
        f.service.decide(f.actor, { type: 'wait' }, f.world, 7050)
        expect(f.service.blocksScenario(f.actor, 7050)).toBe(false)
        expect(f.actor.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
    })

    it('does not grant Spark or a lease for rejected automation', () => {
        const f = fixture()
        f.world.requestAutomation = () => ({
            accepted: false,
            error: 'Not allowed',
            events: [],
        })
        expect(
            f.service.decide(f.actor, { type: 'marker_create' }, f.world, 1000)
                .accepted
        ).toBe(false)
        expect(f.service.hasActiveLease(f.actor, 1000)).toBe(false)
        expect(f.actor.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
    })
})

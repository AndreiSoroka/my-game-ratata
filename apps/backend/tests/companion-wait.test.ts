import { expect, it } from 'vitest'

import type { CompanionWorld } from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import { NavigationService } from '../src/game/navigation'

function setup() {
    const npc = new GameCharacter({
        id: 'npc_magic_slime_1',
        nickname: 'Капля',
        archetype: 'slime',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
        soul: { canSpeak: true },
    })
    const owner = new GameCharacter({
        id: 'owner',
        nickname: 'Игрок',
        archetype: 'human',
        controllerKind: 'network_player',
        faction: 'peaceful',
        spawnPosition: { x: 88, y: 80 },
    })
    owner.connected = true
    const service = new CompanionService()
    const navigation = new NavigationService({
        id: npc.locationId,
        width: 30,
        height: 30,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(900).fill(false),
    })
    const world: CompanionWorld = {
        navigationFor: () => navigation,
        getCharacter: (id) => (id === owner.id ? owner : npc),
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
    }
    const wait = (waitMode: 'until_request' | 'until_return') =>
        service.handle(
            owner,
            {
                type: 'companion_request',
                targetId: npc.id,
                request: 'wait',
                waitMode,
            },
            [npc, owner],
            1000,
            {
                modelConsent: true,
                questCompleted: () => false,
                hasLineOfSight: () => true,
            }
        )
    return { npc, owner, service, world, wait }
}
it('retains peaceful wait until another accepted order, even after the owner returns', () => {
    const f = setup()
    f.wait('until_request')
    f.owner.position.x = 200
    f.service.update(f.npc, f.world, 1100)
    f.owner.position.x = 88
    f.service.update(f.npc, f.world, 1200)
    expect(f.npc.soul.companion).toMatchObject({
        order: 'wait',
        leaderId: f.owner.id,
        waitMode: 'until_request',
    })
    expect(f.npc.hasPath()).toBe(false)
})
it('resumes explicit until-return wait only after an actual departure and visible return', () => {
    const f = setup()
    f.wait('until_return')
    f.service.update(f.npc, f.world, 1050)
    expect(f.npc.soul.companion?.order).toBe('wait')
    f.owner.position.x = 200
    f.service.update(f.npc, f.world, 1100)
    f.owner.position.x = 140
    f.service.update(f.npc, f.world, 1150)
    expect(f.npc.soul.companion?.order).toBe('wait')
    f.owner.position.x = 110
    f.service.update(f.npc, f.world, 1200)
    expect(f.npc.soul.companion?.order).toBe('follow')
    expect(f.npc.soul.companion?.controlRevision).toBe(2)
})

it('does not interpret a disconnect and reconnect at the same point as departing and returning', () => {
    const f = setup()
    f.wait('until_return')
    f.owner.connected = false
    f.service.update(f.npc, f.world, 1100)
    f.owner.connected = true
    f.service.update(f.npc, f.world, 1200)
    expect(f.npc.soul.companion?.order).toBe('wait')
})

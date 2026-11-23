import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'

function fixture() {
    const service = new AdventureService({
        now: () => 5000,
        resourceNodes: [],
        worldObjects: [],
    })
    const actor = (id: string, player = true) =>
        new GameCharacter({
            id,
            nickname: id,
            archetype: 'human',
            controllerKind: player ? 'network_player' : 'scripted',
            faction: 'peaceful',
            spawnPosition: { x: 80, y: 80 },
        })
    const first = actor('first'),
        second = actor('second'),
        npc = actor('npc_merchant_1', false)
    const characters = [first, second, npc]
    const navigation = new NavigationService({
        id: 'conversation',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const open = (player = first, shop = true) =>
        service.interact(
            player,
            npc.id,
            characters,
            navigation,
            5000,
            shop ? 'shop' : undefined
        )
    const reconcile = (threat = false) =>
        service.reconcileConversations(
            characters,
            () => navigation,
            () => threat
        )
    return {
        service,
        first,
        second,
        npc,
        navigation,
        characters,
        open,
        reconcile,
    }
}

describe('validated NPC conversations', () => {
    it('stops movement immediately and keeps an NPC held until its final valid viewer closes', () => {
        const f = fixture()
        f.npc.setPath([{ x: 160, y: 80 }])
        f.open()
        expect(f.npc.hasPath()).toBe(false)
        f.open(f.second)
        expect(f.reconcile().has(f.npc.id)).toBe(true)
        f.service.choose(f.first, 'close', f.characters, f.navigation, 5000)
        expect(f.reconcile().has(f.npc.id)).toBe(true)
        f.service.choose(f.second, 'leave', f.characters, f.navigation, 5000)
        expect(f.reconcile().has(f.npc.id)).toBe(false)
    })

    it('keeps a text conversation available while the NPC continues its path', () => {
        const f = fixture()
        f.npc.setPath([{ x: 160, y: 80 }])
        f.open(f.first, false)
        expect(f.reconcile().size).toBe(0)
        expect(f.npc.hasPath()).toBe(true)
        expect(f.service.snapshot(f.first.id).dialogue?.npcId).toBe(f.npc.id)
    })

    it.each([
        'distance',
        'sight',
        'travel',
        'dead_viewer',
        'dead_npc',
        'disconnect',
        'threat',
    ])('closes stale sessions and releases a hold after %s', (reason) => {
        const f = fixture()
        f.open()
        if (reason === 'distance') {
            f.first.position.x += 49
        }
        if (reason === 'sight') {
            vi.spyOn(f.navigation, 'hasLineOfSight').mockReturnValue(false)
        }
        if (reason === 'travel') {
            f.first.locationId = 'map-1-2'
        }
        if (reason === 'dead_viewer') {
            f.first.alive = false
        }
        if (reason === 'dead_npc') {
            f.npc.alive = false
        }
        if (reason === 'disconnect') {
            f.first.connected = false
        }
        expect(f.reconcile(reason === 'threat').size).toBe(0)
        expect(f.service.snapshot(f.first.id).dialogue).toBeNull()
    })

    it('closes either endpoint explicitly and does not revive a session on reconnect', () => {
        const f = fixture()
        f.open()
        f.open(f.second)
        f.service.closeConversations(f.npc.id)
        expect(f.reconcile().size).toBe(0)
        f.open()
        f.service.closeConversations(f.first.id)
        f.first.connected = false
        f.reconcile()
        f.first.connected = true
        expect(f.reconcile().size).toBe(0)
    })
})

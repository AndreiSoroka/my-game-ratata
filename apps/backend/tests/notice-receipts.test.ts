import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { PartyService } from '../src/game/parties'

function actor(id: string) {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 72, y: 88 },
    })
}

describe('action notice receipts', () => {
    it('identifies repeated equal barrel messages without replaying them on every snapshot', () => {
        const player = actor('reader')
        const navigation = new NavigationService({
            id: 'test',
            width: 12,
            height: 12,
            tileWidth: 16,
            tileHeight: 16,
            solidLayerNames: [],
            solid: Array<boolean>(144).fill(false),
        })
        const service = new AdventureService({
            worldObjects: ['first', 'second'].map((id, index) => ({
                id,
                name: 'Припасы',
                text: '',
                kind: 'barrel',
                locationId: CENTER_LOCATION_ID,
                bounds: { x: 64 + index * 32, y: 64, width: 16, height: 16 },
            })),
        })
        service.handle(
            player,
            { type: 'world_interact', objectId: 'first' },
            [],
            navigation
        )
        const first = service.snapshot(player.id, player.locationId, player)
        expect(first.notice).toContain('В бочке')
        for (let index = 0; index < 20; index += 1) {
            expect(
                service.snapshot(player.id, player.locationId, player).noticeId
            ).toBe(first.noticeId)
        }
        service.handle(
            player,
            { type: 'world_interact', objectId: 'second' },
            [],
            navigation
        )
        const second = service.snapshot(player.id, player.locationId, player)
        expect(second.notice).toBe(first.notice)
        expect(second.noticeId).toBeGreaterThan(first.noticeId ?? -1)
        expect(second.materials.wood).toBe(2)
        expect(service.snapshot('observer').noticeId).toBe(0)
        service.observe(
            [{ kind: 'permadeath', actorId: player.id }],
            () => player
        )
        expect(
            service.snapshot(player.id, player.locationId, player)
        ).toMatchObject({
            notice: null,
            noticeId: 0,
        })
    })

    it('keeps party results private and assigns a fresh receipt to repeated equal failures', () => {
        const player = actor('leader')
        const other = actor('bystander')
        const parties = new PartyService()
        const message = { type: 'party_invite', targetId: 'missing' } as const
        expect(parties.handle(player, message, [player, other], 1000)).toEqual(
            []
        )
        const first = parties.snapshot(player.id)
        expect(first.notice).toContain('Пригласи')
        expect(parties.snapshot(player.id).noticeId).toBe(first.noticeId)
        parties.handle(player, message, [player, other], 2000)
        const next = parties.snapshot(player.id)
        expect(next.notice).toBe(first.notice)
        expect(next.noticeId).toBeGreaterThan(first.noticeId ?? -1)
        expect(parties.snapshot(other.id)).toMatchObject({
            notice: null,
            noticeId: 0,
        })
    })
})

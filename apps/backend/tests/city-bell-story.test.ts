import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { CityWorldState } from '../src/game/cityWorldState'
import { countInventoryItem } from '../src/game/inventory'
import { cityActor, cityBellFixture, giveHearts } from './cityBellFixture'

describe('shared city Bell order', () => {
    it('chooses both deterministic start branches without order-dependent RNG', () => {
        const choices = new Set<string>()
        for (let index = 0; index < 100; index++) {
            const first = new CityWorldState()
            const second = new CityWorldState()
            first.configure(`city-${String(index)}`)
            second.configure(`city-${String(index)}`)
            expect(first.snapshot(CENTER_LOCATION_ID)).toEqual(
                second.snapshot(CENTER_LOCATION_ID)
            )
            choices.add(first.snapshot(CENTER_LOCATION_ID)?.bellState ?? '')
        }
        expect([...choices].sort()).toEqual(['active', 'silent'])
    })

    it('consumes one real delivery and one finite budget, cancelling competing accepted orders', () => {
        const f = cityBellFixture()
        f.accept(f.actor)
        f.accept(f.other)
        giveHearts(f.actor)
        giveHearts(f.other)
        expect(f.service.questFunding.availableGold(CENTER_LOCATION_ID)).toBe(
            260
        )
        expect(f.submit().accepted).toBe(true)
        expect(f.snapshot()).toMatchObject({
            quest: { status: 'completed' },
            gold: 40,
            lastQuestRewardReceiptId: `city-story:${CENTER_LOCATION_ID}:${f.snapshot().quest.id}`,
            trophies: 0,
            cityState: { bellState: 'prepared' },
            wardRestored: false,
        })
        expect(f.snapshot(f.other)).toMatchObject({
            quest: { status: 'cancelled', accepted: true },
            gold: 0,
            trophies: 3,
        })
        expect(f.snapshot(f.other)).not.toHaveProperty(
            'lastQuestRewardReceiptId'
        )
        expect(f.snapshot(f.other).quest.notice).toContain(
            'Городской заказ уже выполнен'
        )
        f.submit(f.other)
        f.submit()
        expect(f.snapshot().gold).toBe(40)
        expect(f.snapshot(f.other).gold).toBe(0)
        expect(countInventoryItem(f.other.inventory, 'slime_heart')).toBe(3)
        expect(f.service.questFunding.wallet(CENTER_LOCATION_ID)?.gold).toBe(
            260
        )
    })

    it('retains the acceptance reward mode and never completes another recipient’s quest', () => {
        const f = cityBellFixture()
        const friend = cityActor('friend')
        f.service.setQuestRewardMembers(() => [f.actor.id, friend.id])
        f.accept(f.actor, 'party_equal')
        giveHearts(f.actor)
        f.submit()
        expect(f.snapshot().quest.rewardMode).toBe('party_equal')
        expect(f.snapshot().quest.rewardShares).toEqual([
            { characterId: f.actor.id, gold: 20 },
            { characterId: friend.id, gold: 20 },
        ])
        const recipient = f.service.snapshot(
            friend.id,
            friend.locationId,
            friend
        )
        expect(recipient.gold).toBe(20)
        expect(recipient.quest.status).toBe('cancelled')
        expect(recipient.quest.accepted).toBe(false)
    })
})

describe('city story budget and start conditions', () => {
    it('protects the one city budget from unrelated reservations until successful delivery', () => {
        const f = cityBellFixture()
        const wallet = f.service.questFunding.wallet(CENTER_LOCATION_ID)
        expect(wallet).toBeDefined()
        if (wallet === undefined) {
            throw new Error('Missing city wallet')
        }
        expect(
            f.service.questFunding.reservations.reserve(
                'unrelated',
                { inventory: [], wallet },
                260,
                []
            )
        ).toBe(true)
        expect(f.service.questFunding.availableGold(CENTER_LOCATION_ID)).toBe(0)
        f.accept()
        giveHearts(f.actor)
        expect(f.submit().accepted).toBe(true)
        expect(f.snapshot().gold).toBe(40)
        expect(wallet.gold).toBe(260)
        expect(f.service.questFunding.availableGold(CENTER_LOCATION_ID)).toBe(0)
    })

    it('rejects insufficient, reserved and impossible payments atomically', () => {
        const f = cityBellFixture()
        f.accept()
        giveHearts(f.actor, 2)
        f.submit()
        expect(f.snapshot().gold).toBe(0)
        expect(f.snapshot().cityState?.bellState).toBe('silent')
        giveHearts(f.actor, 1)
        const heart = f.actor.inventory[0]
        if (heart === undefined) {
            throw new Error('Missing test heart')
        }
        const reservations = f.service.questFunding.reservations
        expect(
            reservations.reserve(
                'held-heart',
                {
                    inventory: f.actor.inventory,
                    wallet: f.service.walletFor(f.actor.id),
                },
                0,
                [{ instanceId: heart.instanceId, quantity: 1 }]
            )
        ).toBe(true)
        f.submit()
        expect(f.snapshot().trophies).toBe(3)
        expect(f.snapshot().gold).toBe(0)
        reservations.release('held-heart')
        f.service.walletFor(f.actor.id).gold = Number.MAX_SAFE_INTEGER
        f.submit()
        expect(f.snapshot().trophies).toBe(3)
        expect(f.snapshot().cityState?.bellState).toBe('silent')
        expect(f.service.questFunding.wallet(CENTER_LOCATION_ID)?.gold).toBe(
            300
        )
    })

    it('active starts need no hearts and do not grant a personal quest completion', () => {
        const f = cityBellFixture('active')
        f.accept()
        f.submit()
        expect(f.snapshot()).toMatchObject({
            cityState: { bellState: 'active' },
            wardRestored: true,
            quest: { status: 'cancelled', accepted: false },
            gold: 0,
            trophies: 0,
        })
        expect(f.service.questFunding.availableGold(CENTER_LOCATION_ID)).toBe(
            300
        )
        expect(f.ring().events).toEqual([])
    })
})

describe('physical city Bell activation', () => {
    it('activates once through ordinary world interaction after a real delivery', () => {
        const f = cityBellFixture()
        const activated: string[] = []
        f.service.cities.onActivation((cityId) => activated.push(cityId))
        expect(f.ring().accepted).toBe(false)
        f.accept()
        giveHearts(f.actor)
        f.submit()
        f.service.choose(
            f.actor,
            'restore_ward',
            f.actors,
            f.navigation,
            f.clock.now
        )
        expect(f.snapshot().cityState?.bellState).toBe('prepared')
        const result = f.ring()
        expect(result.accepted).toBe(true)
        expect(result.events).toMatchObject([
            {
                kind: 'bell_activate',
                objectId: f.bell.id,
                eventId: `city-bell:${CENTER_LOCATION_ID}:active`,
            },
        ])
        expect(f.snapshot().wardRestored).toBe(true)
        expect(f.ring(f.other).events).toEqual([])
        expect(f.ring().events).toEqual([])
        expect(activated).toEqual([CENTER_LOCATION_ID])
    })

    it.each([
        'far',
        'wall',
        'dead',
        'offline',
        'stunned',
        'other-location',
    ] as const)(
        'rechecks %s at the authoritative interaction boundary',
        (condition) => {
            const f = cityBellFixture('prepared')
            if (condition === 'far') {
                f.actor.position.x = 16
            }
            if (condition === 'wall') {
                f.navigation.grid.solid[6 * 24 + 10] = true
            }
            if (condition === 'dead') {
                f.actor.alive = false
            }
            if (condition === 'offline') {
                f.actor.tags.add('offline')
            }
            if (condition === 'stunned') {
                f.actor.stunUntil = f.clock.now + 1000
            }
            if (condition === 'other-location') {
                f.actor.locationId = 'map-0-0'
            }
            expect(f.ring().accepted).toBe(false)
            expect(
                f.service.cities.snapshot(CENTER_LOCATION_ID)?.bellState
            ).toBe('prepared')
        }
    )

    it('does not reconfigure a live world or replace map data after personal state exists', () => {
        const f = cityBellFixture()
        f.snapshot()
        expect(() => f.service.initializeCities({ seed: 'another' })).toThrow()
        expect(() =>
            f.service.initializeWorldData({ resourceNodes: [] })
        ).toThrow()
    })
})

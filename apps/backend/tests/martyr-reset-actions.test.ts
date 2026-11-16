import { describe, expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import { createItemInstance } from '../src/game/inventory'
import { studyMagic } from '../src/game/magicLearning'
import { PartyService } from '../src/game/parties'
import { turnInHearts } from '../src/game/trophyQuest'
import { WorldInventory } from '../src/game/worldInventory'
import { type LooseWorldItem, pickupWorldItem } from '../src/game/worldPickup'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function inProgress(actor: ReturnType<typeof abilityHero>): void {
    actor.martyr.cycles = 3
    actor.martyr.pendingHostileWound = true
}

describe('Martyr resets only after resolved shared actions', () => {
    it('ignores failed pickup, resets on a real transfer, and leaves the prior owner untouched', () => {
        const actor = abilityHero()
        inProgress(actor)
        const items = new Map<string, LooseWorldItem>([
            [
                'food',
                {
                    id: 'food',
                    item: createItemInstance('food'),
                    position: actor.position,
                },
            ],
        ])
        expect(
            pickupWorldItem(actor, items, actor.locationId, 'missing', 1000)
        ).toEqual([])
        expect(actor.martyr.cycles).toBe(3)
        expect(
            pickupWorldItem(actor, items, actor.locationId, 'food', 1000)
        ).toHaveLength(1)
        expect(actor.martyr.cycles).toBe(0)
        expect(actor.martyr.pendingHostileWound).toBe(false)
    })

    it('requires real inventory use and does not treat food as another prayer cycle', () => {
        const actor = abilityHero()
        const inventory = new WorldInventory(abilityContext([actor]).navigation)
        const food = createItemInstance('food')
        actor.inventory.push(food)
        inProgress(actor)
        expect(
            inventory.applyInventoryAction(actor, 'eat', food.instanceId, 1000)
        ).toEqual([])
        expect(actor.martyr.cycles).toBe(3)
        actor.hp -= 1
        expect(
            inventory.applyInventoryAction(actor, 'eat', food.instanceId, 1000)
                .length
        ).toBeGreaterThan(0)
        expect(actor.martyr.cycles).toBe(0)
        expect(
            actor.progression.constellations.opened.has('prayer.martyr')
        ).toBe(false)
    })

    it('ignores unsuccessful learning and resets on an actual chapter learned', () => {
        const actor = abilityHero()
        const scholar = abilityHero('arcanist')
        inProgress(actor)
        expect(studyMagic(actor, scholar, 1000)).toEqual([])
        expect(actor.martyr.cycles).toBe(3)
        scholar.tags.add('scholar')
        expect(studyMagic(actor, scholar, 1000).length).toBeGreaterThan(0)
        expect(actor.martyr.cycles).toBe(0)
    })

    it('does not reset an invite recipient until they actually accept membership', () => {
        const actor = abilityHero()
        const leader = abilityHero()
        const parties = new PartyService()
        const characters = [actor, leader]
        inProgress(actor)
        parties.handle(
            leader,
            { type: 'party_invite', targetId: actor.id },
            characters,
            1000
        )
        expect(actor.martyr.cycles).toBe(3)
        const invite = parties.snapshot(actor.id).invitations[0]
        if (invite === undefined) {
            throw new Error('Missing invitation')
        }
        parties.handle(
            actor,
            { type: 'party_answer', invitationId: invite.id, accept: true },
            characters,
            1001
        )
        expect(parties.sameParty(actor.id, leader.id)).toBe(true)
        expect(actor.martyr.cycles).toBe(0)
    })

    it('resets quest completion only after the atomic payout is accepted', () => {
        const actor = abilityHero()
        const state = createAdventureState()
        state.questStatus = 'active'
        actor.inventory.push(
            createItemInstance('slime_heart'),
            createItemInstance('slime_heart'),
            createItemInstance('slime_heart')
        )
        inProgress(actor)
        expect(
            turnInHearts(state, actor, {
                award: () => ({ ok: false, shares: [] }),
            })
        ).toBe(false)
        expect(actor.martyr.cycles).toBe(3)
        expect(
            turnInHearts(state, actor, {
                award: () => ({ ok: true, shares: [], alreadyPaid: false }),
            })
        ).toBe(true)
        expect(state.questStatus).toBe('completed')
        expect(actor.martyr.cycles).toBe(0)
    })
})

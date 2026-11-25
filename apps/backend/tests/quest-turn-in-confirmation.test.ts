import { expect, it } from 'vitest'

import { ExchangeService } from '../src/game/exchange'
import { createItemInstance } from '../src/game/inventory'
import { conversationContracts } from '../src/game/questConversation'
import { QuestTurnInService } from '../src/game/questTurnIn'
import { WhisperService } from '../src/game/whispers'
import { npcQuestFixture } from './npcQuestFixture'

function fixture(quantities = [3]) {
    const f = npcQuestFixture()
    const herbs = createItemInstance('herbs', 3)
    f.player.inventory.push(herbs)
    const instanceId = f.accept(
        f.draft({
            objectives: quantities.map((quantity) => ({
                kind: 'deliver',
                itemId: 'herbs',
                quantity,
                recipientId: f.issuer.id,
            })),
        })
    )
    const environment = {
        localeFor: () => 'ru' as const,
        adventure: f.adventure,
        parties: f.parties,
        quests: f.service,
        getCharacter: (id: string) => f.characters.get(id),
        characters: () => f.characters.values(),
        navigationFor: () => f.navigation,
        exchanges: new ExchangeService({
            getCharacter: (id) => f.characters.get(id),
            navigationFor: () => f.navigation,
            aiDialogue: () => true,
            canControlAI: () => true,
            walletFor: f.adventure.walletFor,
        }),
        whispers: new WhisperService({
            getCharacter: (id) => f.characters.get(id),
            navigationFor: () => f.navigation,
            heard: () => undefined,
        }),
    }
    const turnIn = new QuestTurnInService(environment)
    const prompt = (now = 30) => {
        const view = turnIn.snapshot(f.player, now)
        if (view === null) {
            throw new Error('Missing hand-in prompt')
        }
        return view
    }
    return { ...f, environment, herbs, instanceId, turnIn, prompt }
}

it('opens ready terms, pays only on the owning player click and replays without a second transfer', () => {
    const f = fixture()
    expect(f.turnIn.heard(f.player, f.issuer, 'квест готов', 30)).toBe(true)
    const view = f.prompt()
    expect(view).toMatchObject({
        instanceId: f.instanceId,
        rewardGold: 10,
        source: 'npc',
        action: 'turn_in',
        canConfirm: true,
    })
    expect(f.adventure.snapshot(f.player.id).gold).toBe(0)
    expect(f.turnIn.confirm(f.friend, view.id, true, 31).accepted).toBe(false)
    expect(f.turnIn.confirm(f.player, view.id, true, 31).accepted).toBe(true)
    expect(f.turnIn.snapshot(f.player, 32)).toBeNull()
    expect(f.turnIn.confirm(f.player, view.id, true, 33).accepted).toBe(true)
    expect(f.adventure.snapshot(f.player.id).gold).toBe(10)
    expect(f.adventure.questFunding.wallet(f.issuer.locationId)?.gold).toBe(290)
    expect(f.player.inventory).toHaveLength(0)
    expect(
        f.issuer.inventory.find((item) => item.itemId === 'herbs')?.quantity
    ).toBe(3)
    expect(
        conversationContracts(f.environment, f.issuer.id, f.player.id, 33)[0]
            ?.status
    ).toBe('completed')
})

it('keeps delivery requirements visible at zero, counts only free items and aggregates duplicate requirements', () => {
    const f = fixture([2, 1])
    f.player.inventory.splice(0)
    expect(f.turnIn.heard(f.player, f.issuer, 'Хочу сдать квест', 30)).toBe(
        true
    )
    const view = f.prompt()
    expect(view).toMatchObject({
        canConfirm: false,
        missingItems: [{ itemId: 'herbs', required: 3, available: 0 }],
    })

    f.player.inventory.push(f.herbs)
    const reservations = f.adventure.questFunding.reservations
    expect(
        reservations.reserve(
            'promised-herb',
            {
                inventory: f.player.inventory,
                wallet: f.adventure.walletFor(f.player.id),
            },
            0,
            [{ instanceId: f.herbs.instanceId, quantity: 1 }]
        )
    ).toBe(true)
    expect(f.prompt(31)).toMatchObject({
        id: view.id,
        canConfirm: false,
        missingItems: [{ itemId: 'herbs', required: 3, available: 2 }],
    })
    expect(reservations.release('promised-herb')).toBe(true)
    const ready = f.prompt(32)
    expect(ready).toMatchObject({ id: view.id, canConfirm: true })
    expect(ready.missingItems).toBeUndefined()
    expect(f.turnIn.confirm(f.player, view.id, true, 33).accepted).toBe(true)
    expect(f.adventure.snapshot(f.player.id).gold).toBe(10)
})

it('shows a transfer blocker while the quest giver and player can talk across a table', () => {
    const f = fixture()
    f.putTableBetweenPlayerAndIssuer()
    expect(f.turnIn.heard(f.player, f.issuer, 'Хочу сдать квест', 30)).toBe(
        true
    )
    const view = f.prompt()
    expect(view).toMatchObject({
        canConfirm: false,
        blockedReason: 'approach_issuer',
    })
    expect(view.missingItems).toBeUndefined()
    f.player.position = { ...f.issuer.position }
    const ready = f.prompt(31)
    expect(ready).toMatchObject({ id: view.id, canConfirm: true })
    expect(ready.blockedReason).toBeUndefined()
})

it('does not treat yes, an unrelated conversation or a negative statement as surrender', () => {
    const f = fixture()
    expect(
        f.turnIn.open(f.issuer, f.player.id, f.instanceId, 30).accepted
    ).toBe(false)
    expect(f.turnIn.heard(f.player, f.issuer, 'да', 30)).toBe(false)
    expect(f.turnIn.heard(f.player, f.issuer, 'квест не готов', 31)).toBe(false)
    expect(f.turnIn.heard(f.player, f.issuer, 'привет', 32)).toBe(false)
    expect(
        f.turnIn.open(f.issuer, f.player.id, f.instanceId, 32).accepted
    ).toBe(false)
    expect(f.turnIn.snapshot(f.player, 32)).toBeNull()
    expect(f.adventure.snapshot(f.player.id).gold).toBe(0)
})

it('recognizes the English completion phrase without opening on questions or denials', () => {
    const f = fixture()
    for (const text of ['not quest complete', 'quest complete?']) {
        expect(f.turnIn.heard(f.player, f.issuer, text, 30)).toBe(false)
    }
    expect(f.turnIn.heard(f.player, f.issuer, 'Quest complete!', 30)).toBe(true)
    expect(f.prompt().instanceId).toBe(f.instanceId)
    expect(f.adventure.snapshot(f.player.id).gold).toBe(0)
})

it('expires at exactly thirty seconds and an old click cannot discard a fresh prompt', () => {
    const f = fixture()
    f.turnIn.heard(f.player, f.issuer, 'готово', 30)
    const first = f.prompt()
    expect(f.turnIn.snapshot(f.player, 30_029)).not.toBeNull()
    expect(f.turnIn.confirm(f.player, first.id, true, 30_030).accepted).toBe(
        false
    )
    f.turnIn.heard(f.player, f.issuer, 'готово', 30_031)
    const second = f.prompt(30_031)
    expect(second.id).not.toBe(first.id)
    expect(f.turnIn.confirm(f.player, first.id, true, 30_032).accepted).toBe(
        false
    )
    expect(f.prompt(30_032).id).toBe(second.id)
    expect(f.adventure.snapshot(f.player.id).gold).toBe(0)
})

it('renews the same confirmation when the player repeats the hand-in request', () => {
    const f = fixture()
    f.turnIn.heard(f.player, f.issuer, 'Квест готов.', 30)
    const original = f.prompt()
    f.turnIn.heard(f.player, f.issuer, 'Хочу сдать квест.', 25_000)
    expect(f.prompt(30_030)).toMatchObject({
        id: original.id,
        expiresAt: 55_000,
    })
    expect(f.turnIn.snapshot(f.player, 55_000)).toBeNull()
})

it('rechecks actual deliveries, location, life and reach before any asset mutation', () => {
    const f = fixture()
    f.turnIn.heard(f.player, f.issuer, 'готово', 30)
    const view = f.prompt()
    const herbs = f.player.inventory.splice(0)
    expect(f.turnIn.confirm(f.player, view.id, true, 31).accepted).toBe(false)
    const updated = f.prompt(31)
    expect(updated.id).not.toBe(view.id)
    expect(updated).toMatchObject({
        canConfirm: false,
        missingItems: [{ itemId: 'herbs', required: 3, available: 0 }],
    })
    f.player.inventory.push(...herbs)
    f.player.locationId = 'map-2-1'
    expect(f.turnIn.confirm(f.player, updated.id, true, 32).accepted).toBe(
        false
    )
    expect(f.turnIn.snapshot(f.player, 32)).toBeNull()
    f.player.locationId = f.issuer.locationId
    f.turnIn.heard(f.player, f.issuer, 'готово', 32)
    const afterTravel = f.prompt(32)
    f.player.position.x += 100
    expect(f.turnIn.confirm(f.player, afterTravel.id, true, 33).accepted).toBe(
        false
    )
    f.player.position.x -= 100
    f.turnIn.heard(f.player, f.issuer, 'готово', 33)
    const beforeDeath = f.prompt(33)
    f.issuer.applyDamage(f.issuer.hp, 34)
    expect(f.turnIn.confirm(f.player, beforeDeath.id, true, 34).accepted).toBe(
        false
    )
    expect(f.adventure.snapshot(f.player.id).gold).toBe(0)
    expect(f.player.inventory).toHaveLength(1)
})

it('cancels the real exchange without transferring its draft when switching to surrender', () => {
    const f = fixture()
    f.environment.exchanges.handle(
        f.player,
        { type: 'exchange_invite', targetId: f.issuer.id },
        25
    )
    const exchange = f.environment.exchanges.snapshot(f.player.id)
    if (exchange === null) {
        throw new Error('Missing exchange')
    }
    f.environment.exchanges.handle(
        f.issuer,
        { type: 'exchange_answer', exchangeId: exchange.id, accept: true },
        26
    )
    expect(f.turnIn.heard(f.player, f.issuer, 'квест готов', 30)).toBe(true)
    expect(f.environment.exchanges.snapshot(f.player.id)?.status).toBe(
        'cancelled'
    )
    expect(f.player.inventory).toHaveLength(1)
    expect(f.adventure.snapshot(f.player.id).gold).toBe(0)
})

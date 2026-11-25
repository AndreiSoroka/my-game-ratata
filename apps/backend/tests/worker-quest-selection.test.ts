import assert from 'node:assert/strict'

import { expect, it } from 'vitest'

import { workerConversation } from './workerDialogueFixture'
import { WorkerSimulation } from './workerRequestFixture'

function fixture(silentBell = false) {
    const simulation = new WorkerSimulation('farmer', {
        workerIdentity: { id: 'npc_farmer_1', nickname: 'Фермер Агафья' },
    })
    if (silentBell) {
        simulation.adventure.initializeCities({
            seed: 'quest-selection',
            initialBellState: 'silent',
        })
    }
    simulation.publish()
    const { player, clerk, now } = simulation
    const conversation = workerConversation(simulation)
    const { turns, quests, whispers } = conversation
    return {
        simulation,
        ...conversation,
        ask: (text: string) => turns.heard(player, clerk, text, now),
        offer: () => quests.snapshot(player.id, now).questOffer,
        reply: () => whispers.snapshot(player, now)?.messages.at(-1)?.text,
    }
}

it.each(['помочь Агафья', 'Заказ Агафьи', 'Агафье'])(
    'opens the same worker offer after the player specifies %s',
    (answer) => {
        const f = fixture()
        const { clerk, now, player } = f.simulation
        expect(f.ask('Давай я возьму этот квест')).toBe(true)
        expect(f.reply()).toContain('Фермер Агафья')
        expect(f.offer()).toBeNull()
        expect(f.ask('Не возьму этот квест')).toBe(false)
        expect(f.offer()).toBeNull()
        const other = f.simulation.characters.get('npc_merchant_1')
        assert(other !== undefined)
        expect(f.turns.heard(player, other, answer, now)).toBe(false)
        expect(f.ask(answer)).toBe(true)
        const offer = f.offer()
        assert(offer !== undefined && offer !== null)
        const request = f.simulation.current()
        expect(offer).toMatchObject({
            issuerId: clerk.id,
            workerRequestId: request.id,
        })
        expect(f.simulation.requests.list()).toContainEqual(request)
        expect(f.parties.boardActiveJobs(player.id)).toEqual([])

        const result = f.quests.handle(
            player,
            {
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: offer.revision,
                accept: true,
            },
            now
        )
        expect(result.accepted).toBe(true)
        expect(f.parties.boardActiveJobs(player.id)[0]?.workRequest?.id).toBe(
            request.id
        )
        expect(f.simulation.requests.list()).toHaveLength(0)
    }
)

it('does not substitute another order when the chosen worker request has been claimed', () => {
    const f = fixture()
    const { now, requests, characters } = f.simulation
    const request = f.simulation.current()
    expect(f.ask('дай квест и я расчищу поля')).toBe(true)
    expect(
        requests.accept(
            request.id,
            'party:rival',
            new Set(['rival']),
            characters,
            now
        )
    ).toBeNull()
    expect(f.ask('Заказ Агафьи')).toBe(true)
    expect(f.offer()).toBeNull()
    expect(f.reply()).toContain('уже недоступно')
})

it('keeps a newer hand-in window when an earlier model reply arrives', () => {
    const f = fixture(true)
    const { clerk, now, player } = f.simulation
    const workerOrder = f.simulation.current().id
    const earlierDialogue = {
        autonomous: false,
        freshDialogueTargetId: player.id,
        freshDialogueMessageId: 'old-request',
        freshDialogueAt: now,
    }
    expect(
        f.turns.open(clerk, player.id, workerOrder, now, earlierDialogue)
            .accepted
    ).toBe(true)
    expect(f.ask('Хочу сдать Сердца для колокола памяти')).toBe(true)
    const newer = f.turns.snapshot(player, now)
    expect(newer).toMatchObject({ source: 'story' })
    expect(
        f.turns.open(clerk, player.id, workerOrder, now, earlierDialogue)
            .accepted
    ).toBe(false)
    expect(f.turns.snapshot(player, now)).toEqual(newer)
})

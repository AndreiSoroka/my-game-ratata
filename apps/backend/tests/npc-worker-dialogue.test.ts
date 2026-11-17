import { expect, it } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { configureNpcQuestDialogue } from '../src/game/npcQuestDialogue'
import { NpcQuestService } from '../src/game/npcQuests'
import { PartyService } from '../src/game/parties'
import {
    canContactGuild,
    createWorkerGuildGateway,
} from '../src/game/roomWorkerRequests'
import { workerActivity } from '../src/game/workerActivity'
import { WorkerSimulation } from './workerRequestFixture'

it('offers the clerk’s real worker incident through dialogue and completes the same sowing and payout chain', () => {
    const f = new WorkerSimulation('farmer')
    f.prepareFarm('bare')
    f.worker.inventory.push(createItemInstance('wheat_seed'))
    f.publish()
    const parties = new PartyService(f.adventure.grantQuestGoldOnce, {
        workers: createWorkerGuildGateway(f.requests, () => f.room),
        canContact: (actor, npc) => canContactGuild(actor, npc, f.room),
    })
    parties.update(f.characters.values(), f.now)
    const quests = new NpcQuestService({
        adventure: f.adventure,
        parties,
        workers: f.requests,
        characters: () => f.characters.values(),
        getCharacter: (id) => f.characters.get(id),
        navigationFor: (actor) => f.room.navigationFor(actor),
    })
    configureNpcQuestDialogue(f.adventure, quests, f.requests, (id) =>
        f.characters.get(id)
    )
    const open = f.room.requestAdventure(
        f.player,
        { type: 'interact', targetId: f.clerk.id },
        f.now
    )
    expect(open.accepted).toBe(true)
    const dialogue = f.adventure.snapshot(
        f.player.id,
        f.player.locationId,
        f.player
    ).dialogue
    const choice = dialogue?.choices.find((entry) =>
        entry.id.startsWith('worker-contract:')
    )
    expect(choice?.id).toContain(f.current().id)
    f.room.requestAdventure(
        f.player,
        { type: 'dialogue_choice', choiceId: choice?.id ?? '' },
        f.now
    )
    const offer = quests.snapshot(f.player.id, f.now).questOffer
    expect(offer?.funding).toBe('worker')
    expect(
        quests.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer?.id ?? '',
                revision: 1,
                accept: true,
            },
            f.now
        ).accepted
    ).toBe(true)
    const contract = parties.snapshot(f.player.id).activeJob
    expect(contract?.workRequest?.id).toBe(f.current().id)
    expect(f.requests.list()).toHaveLength(0)
    f.player.inventory.push(createItemInstance('bone'))
    f.enemy.alive = false
    parties.handle(
        f.player,
        { type: 'guild_report', instanceId: contract?.instanceId ?? '' },
        f.characters.values(),
        f.now
    )
    expect(f.current().proofAccepted).toBe(true)
    f.clerk.position = { x: f.clerk.position.x + 40, y: f.clerk.position.y }
    f.until(() =>
        f.commands.some(
            (entry) =>
                entry.message.type === 'farm_action' &&
                entry.message.action === 'sow' &&
                entry.result.accepted
        )
    )
    f.until(() => f.current().stage === 'ready')
    const workCount = f.commands.filter(
        (entry) => entry.message.type === 'farm_action' && entry.result.accepted
    ).length
    f.clerk.position = { x: f.clerk.position.x + 128, y: f.clerk.position.y }
    f.player.position = { ...f.clerk.position }
    parties.handle(
        f.player,
        { type: 'guild_turn_in', instanceId: contract?.instanceId ?? '' },
        f.characters.values(),
        f.now
    )
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    f.until(
        () =>
            Math.hypot(
                f.worker.position.x - f.clerk.position.x,
                f.worker.position.y - f.clerk.position.y
            ) <= 64
    )
    expect(f.current()).toMatchObject({ stage: 'ready', proofAccepted: true })
    expect(
        f.commands.filter(
            (entry) =>
                entry.message.type === 'farm_action' && entry.result.accepted
        )
    ).toHaveLength(workCount)
    parties.handle(
        f.player,
        { type: 'guild_turn_in', instanceId: contract?.instanceId ?? '' },
        f.characters.values(),
        f.now
    )
    expect(f.current().stage).toBe('completed')
    expect(f.adventure.walletFor(f.player.id).gold).toBe(30)
    parties.handle(
        f.player,
        { type: 'guild_turn_in', instanceId: contract?.instanceId ?? '' },
        f.characters.values(),
        f.now
    )
    expect(f.adventure.walletFor(f.player.id).gold).toBe(30)
})

it('does not stop a worker or a moving clerk for an informational model interaction', () => {
    const f = new WorkerSimulation('farmer')
    f.worker.locationId = f.clerk.locationId
    f.worker.position = { ...f.clerk.position }
    f.clerk.setPath([{ x: f.clerk.position.x + 32, y: f.clerk.position.y }])
    const path = f.clerk.remainingPath()
    expect(
        f.room.requestAdventure(
            f.worker,
            { type: 'interact', targetId: f.clerk.id },
            f.now
        ).accepted
    ).toBe(true)
    expect(f.clerk.remainingPath()).toEqual(path)
    f.adventure.reconcileConversations(f.characters.values(), (actor) =>
        f.room.navigationFor(actor)
    )
    expect(f.clerk.remainingPath()).toEqual(path)
    expect(
        f.adventure.snapshot(f.worker.id, f.worker.locationId, f.worker)
            .dialogue
    ).toBeNull()
})

it('reports server reasons for farmer downtime instead of guessing', () => {
    const f = new WorkerSimulation('farmer')
    f.publish()
    expect(
        workerActivity(f.worker, f.adventure, f.requests, f.now)
    ).toMatchObject({
        reason: 'request',
        stage: 'waiting',
        requestId: f.current().id,
        danger: { status: 'reported' },
    })
})

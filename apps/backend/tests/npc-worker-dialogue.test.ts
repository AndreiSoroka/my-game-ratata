import { expect, it } from 'vitest'

import { ExchangeService } from '../src/game/exchange'
import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { configureNpcQuestDialogue } from '../src/game/npcQuestDialogue'
import { NpcQuestService } from '../src/game/npcQuests'
import { PartyService } from '../src/game/parties'
import { QuestTurnInService } from '../src/game/questTurnIn'
import {
    canContactGuild,
    createWorkerGuildGateway,
} from '../src/game/roomWorkerRequests'
import { WhisperService } from '../src/game/whispers'
import { workerActivity } from '../src/game/workerActivity'
import { WorkerSimulation } from './workerRequestFixture'

it('reports an unclaimed incident and starts a repeat trip through chat using only one trophy', () => {
    const f = new WorkerSimulation('miner')
    f.publish()
    const { parties, quests } = createWorkerDialogues(f)
    const getCharacter = (id: string) => f.characters.get(id)
    const navigationFor = f.room.navigationFor
    const turns = new QuestTurnInService({
        adventure: f.adventure,
        parties,
        quests,
        getCharacter,
        characters: () => f.characters.values(),
        navigationFor,
        localeFor: () => 'ru',
        exchanges: new ExchangeService({
            getCharacter,
            navigationFor,
            aiDialogue: () => false,
            canControlAI: () => false,
            walletFor: f.adventure.walletFor,
        }),
        whispers: new WhisperService({
            getCharacter,
            navigationFor,
            heard: () => undefined,
        }),
    })
    const definition = parties
        .boardDefinitions(f.player.id)
        .find((job) => job.id === f.current().id)
    expect(definition).toBeDefined()
    f.player.inventory.push(createItemInstance('bone'))
    expect(
        turns.heard(
            f.player,
            f.clerk,
            `Хочу сдать «${definition?.title ?? ''}»`,
            f.now
        )
    ).toBe(true)
    const first = turns.snapshot(f.player, f.now)
    expect(first).toMatchObject({ preAcceptance: true, action: 'report' })
    expect(f.requests.active('solo:hero')).toBeNull()
    expect(
        turns.confirm(f.player, first?.id ?? '', true, f.now, 'submitter')
            .accepted
    ).toBe(true)
    expect(f.player.inventory).toHaveLength(0)
    expect(f.current()).toMatchObject({
        proofAccepted: true,
        stage: 'outbound',
    })
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    f.until(() => f.current().stage === 'ready')
    f.enemy.alive = true
    parties.update(f.characters.values(), f.now)
    turns.heard(f.player, f.clerk, 'Квест готов.', f.now)
    const payout = turns.snapshot(f.player, f.now)
    expect(payout?.action).toBe('turn_in')
    expect(
        turns.confirm(f.player, payout?.id ?? '', true, f.now).accepted
    ).toBe(false)
    expect(f.current().stage).toBe('waiting')
    f.enemy.alive = false
    turns.heard(f.player, f.clerk, 'Хочу сдать квест.', f.now)
    const retry = turns.snapshot(f.player, f.now)
    expect(retry).toMatchObject({ action: 'report', objectives: [] })
    expect(turns.confirm(f.player, retry?.id ?? '', true, f.now).accepted).toBe(
        true
    )
    expect(f.current()).toMatchObject({
        proofAccepted: true,
        stage: 'outbound',
    })
    expect(f.player.inventory).toHaveLength(0)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
})

it('offers the clerk’s real worker incident through dialogue and completes the same sowing and payout chain', () => {
    const f = new WorkerSimulation('farmer')
    f.prepareFarm('bare')
    f.worker.inventory.push(createItemInstance('wheat_seed'))
    f.publish()
    const { parties, quests } = createWorkerDialogues(f)
    const open = f.room.requestAdventure(
        f.player,
        { type: 'interact', targetId: f.clerk.id, service: 'worker_requests' },
        f.now
    )
    expect(open.accepted).toBe(true)
    const dialogue = f.adventure.snapshot(
        f.player.id,
        f.player.locationId,
        f.player
    ).dialogue
    expect(dialogue).toMatchObject({
        canTrade: false,
        title: 'Обращения работников',
    })
    expect(dialogue?.choices.map(({ id }) => id)).toEqual([
        'leave',
        `worker-contract:${f.current().id}`,
    ])
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

it('validates explicit city and worker services without starting a conversation', () => {
    const f = new WorkerSimulation('farmer')
    const city = {
        type: 'interact',
        targetId: f.clerk.id,
        service: 'city_affairs',
    } as const
    const workers = { ...city, service: 'worker_requests' } as const
    expect(parseClientMessage(JSON.stringify(city))).toEqual({ message: city })
    expect(parseClientMessage(JSON.stringify(workers))).toEqual({
        message: workers,
    })
    expect(
        parseClientMessage(JSON.stringify({ ...city, service: 'unknown' }))
            .message
    ).toBeUndefined()
    expect(f.room.requestAdventure(f.player, workers, f.now).accepted).toBe(
        false
    )
    f.publish()
    createWorkerDialogues(f)

    expect(
        f.room.requestAdventure(
            f.player,
            { ...city, targetId: 'npc_merchant_1' },
            f.now
        ).accepted
    ).toBe(false)
    expect(f.room.requestAdventure(f.player, city, f.now).accepted).toBe(true)
    const dialogue = f.adventure.walletFor(f.player.id).dialogue
    expect(dialogue?.text).toBe('')
    expect(dialogue?.choices.map(({ id }) => id)).toContain('city_report')
    expect(
        dialogue?.choices.some(({ id }) => id.startsWith('worker-contract:'))
    ).toBe(false)
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

function createWorkerDialogues(f: WorkerSimulation) {
    const parties = new PartyService(f.adventure.grantQuestGoldOnce, {
        questRewards: {
            funding: f.adventure.questFunding,
            walletFor: f.adventure.walletFor,
        },
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
    return { parties, quests }
}

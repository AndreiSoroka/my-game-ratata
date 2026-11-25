import {
    CENTER_LOCATION_ID,
    type NpcQuestDecision,
    type QuestDraft,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { parseNpcAiConfig } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import { GameRoom } from '../src/game/room'
import { controlledNpcProvider, miraId, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const fixtures: Array<{ room: GameRoom; diagnostics: NpcAiDiagnostics }> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const f of fixtures.splice(0)) {
        f.room.stop()
        await f.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup(maxCallsPerHour = 120) {
    const provider = controlledNpcProvider()
    const diagnostics = new NpcAiDiagnostics({ sink: () => Promise.resolve() })
    const config = parseNpcAiConfig(
        {
            proactive: true,
            defaults: { timeoutMs: 10_000 },
            limits: { maxCallsPerHour, reviewIntervalMs: 60_000 },
            npcs: [{ actorId: miraId, role: 'city_coordinator' }],
        },
        true
    )
    const room = new GameRoom(undefined, {
        ai: {
            config,
            provider: { decide: provider.decide },
            clock: Date.now,
            diagnostics,
        },
    })
    const alice = joinScenarioRoom(room, 'Invitation Alice')
    const actor = room.getCharacter(miraId)
    if (actor === undefined) {
        throw new Error('Missing city coordinator')
    }
    // Unit fixture placement: the check exercises dialogue commits, not navigation.
    alice.actor.position = { x: actor.position.x, y: actor.position.y + 16 }
    // A greeting was already exchanged, so the fixture can exercise the city review.
    const memory = memoryForCharacter(actor)
    memory.observe(
        alice.actor.id,
        alice.actor.nickname,
        alice.actor.position,
        actor.locationId,
        Date.now()
    )
    memory.recordConversation(alice.actor.id, Date.now())
    const draft: QuestDraft = {
        title: 'Обойти город',
        description: 'Осмотреть Новогород и вернуться.',
        objectives: [{ kind: 'visit', locationId: CENTER_LOCATION_ID }],
        rewardGold: 0,
        rewardItems: [],
        funding: 'city',
    }
    const decision: Extract<NpcQuestDecision, { type: 'quest_propose' }> = {
        type: 'quest_propose',
        targetId: alice.actor.id,
        draft,
    }
    const speech = () =>
        alice.sent.flatMap((m) =>
            m.type === 'event' &&
            m.event.kind === 'chat' &&
            m.event.actorId === actor.id
                ? [m.event]
                : []
        )
    const advance = (milliseconds = 100) =>
        vi.advanceTimersByTimeAsync(milliseconds)
    const talk = (text: string) =>
        alice.send({ type: 'chat', targetId: actor.id, text })
    const invitation = () =>
        room.social.quests.invitationFor(actor.id, alice.actor.id, Date.now())
    room.start()
    const f = {
        room,
        actor,
        alice,
        provider,
        diagnostics,
        decision,
        speech,
        advance,
        talk,
        invitation,
    }
    fixtures.push(f)
    return f
}

async function stage(f: ReturnType<typeof setup>) {
    await f.advance()
    expect(f.provider.turns[0]?.context.task).toMatchObject({
        requesterId: null,
    })
    f.provider.turns[0]?.resolve(
        npcReply(f.decision, {
            speech: 'Есть городское дело. Хочешь посмотреть условия?',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    const invitation = f.invitation()
    if (invitation === null) {
        const context = f.provider.turns.at(-1)?.context
        throw new Error(
            `Expected a spoken pending invitation: ${JSON.stringify({
                events: f.provider.turns[0]?.context.events,
                correction: context?.replyCorrection?.reason,
            })}`
        )
    }
    return invitation
}

it('delivers an autonomous question with no modal, then shows conditions once after a fresh answer', async () => {
    const f = setup()
    const invitation = await stage(f)
    expect(
        f
            .speech()
            .filter(
                (e) =>
                    e.text === 'Есть городское дело. Хочешь посмотреть условия?'
            )
    ).toHaveLength(1)
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    ).toBeNull()
    f.talk('Да, покажи условия.')
    await f.advance()
    const turn = f.provider.turns.at(-1)
    expect(turn?.context.observation.social?.questInvitation).toMatchObject({
        id: invitation.id,
    })
    turn?.resolve(
        npcReply(
            {
                type: 'quest_invitation_answer',
                targetId: f.alice.actor.id,
                invitationId: invitation.id,
                show: true,
            },
            { speech: 'Хорошо, вот условия.', taskAcceptance: 'none' }
        )
    )
    await f.advance()
    const offer = f.room.social.quests.snapshot(
        f.alice.actor.id,
        Date.now()
    ).questOffer
    expect(offer).toMatchObject({
        title: 'Обойти город',
        introduction: 'Хорошо, вот условия.',
    })
    expect(
        f.speech().filter((e) => e.text === 'Хорошо, вот условия.')
    ).toHaveLength(1)
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).quests
    ).toEqual([])
    expect(f.invitation()).toBeNull()
    await f.advance(500)
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
            ?.id
    ).toBe(offer?.id)
    expect(f.provider.turns).toHaveLength(2)
})

it('answers clarification without opening the modal or consuming the invitation', async () => {
    const f = setup()
    const invitation = await stage(f)
    f.talk('Это опасно?')
    await f.advance()
    f.provider.turns.at(-1)?.resolve(
        npcReply(null, {
            speech: 'Это мирный осмотр города.',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    expect(f.invitation()?.id).toBe(invitation.id)
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    ).toBeNull()
})

it('does not give another player the pending invitation or accept their yes for its owner', async () => {
    const f = setup()
    const invitation = await stage(f)
    const bob = joinScenarioRoom(f.room, 'Invitation Bob')
    bob.actor.position = { x: f.actor.position.x + 16, y: f.actor.position.y }
    bob.send({ type: 'chat', targetId: f.actor.id, text: 'Да, покажи.' })
    await f.advance()
    const turn = f.provider.turns.at(-1)
    expect(turn?.context.observation.social?.questInvitation).toBeNull()
    expect(JSON.stringify(turn?.context)).not.toContain(invitation.id)
    turn?.resolve(
        npcReply(
            {
                type: 'quest_invitation_answer',
                targetId: bob.actor.id,
                invitationId: invitation.id,
                show: true,
            },
            { speech: 'Сейчас покажу.', taskAcceptance: 'none' }
        )
    )
    await f.advance()
    expect(f.provider.turns.at(-1)?.context.replyCorrection).toMatchObject({
        code: 'command_unavailable',
    })
    f.provider.turns.at(-1)?.resolve(
        npcReply(null, {
            speech: 'Для тебя пока не предлагала отдельного дела.',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    expect(
        f.room.social.quests.snapshot(bob.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(f.invitation()?.id).toBe(invitation.id)
    expect(f.speech().some((e) => e.text === 'Сейчас покажу.')).toBe(false)
})

it('repairs a silent autonomous proposal once before staging it', async () => {
    const f = setup()
    await f.advance()
    f.provider.turns[0]?.resolve(
        npcReply(f.decision, {
            speech: null,
            memory: 'Отклонённый черновик: задание выдано.',
        })
    )
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.replyCorrection).toMatchObject({
        code: 'command_unavailable',
    })
    expect(f.invitation()).toBeNull()
    expect(f.speech()).toEqual([])
    expect(JSON.stringify(f.provider.turns[1]?.context)).not.toContain(
        'Отклонённый черновик: задание выдано.'
    )
    f.provider.turns[1]?.resolve(
        npcReply(f.decision, {
            speech: 'Хочешь посмотреть городское дело?',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    expect(f.invitation()).not.toBeNull()
    expect(
        f.speech().filter((e) => e.text === 'Хочешь посмотреть городское дело?')
    ).toHaveLength(1)
    expect(f.provider.turns).toHaveLength(2)
})

it('exhausts the two-call repair without an invitation, promise or false memory', async () => {
    const f = setup()
    await f.advance()
    for (let index = 0; index < 2; index++) {
        f.provider.turns[index]?.resolve(
            npcReply(f.decision, {
                speech: null,
                memory: 'Ложное выданное задание.',
            })
        )
        await f.advance()
    }
    expect(f.provider.turns).toHaveLength(2)
    expect(f.invitation()).toBeNull()
    expect(f.speech()).toEqual([])
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(JSON.stringify(memoryForCharacter(f.actor).entries())).not.toContain(
        'Ложное выданное задание.'
    )
    await f.advance(1000)
    expect(f.provider.turns).toHaveLength(2)
})

it('rechecks contact after the asynchronous answer before publishing speech or conditions', async () => {
    const f = setup()
    const invitation = await stage(f)
    f.talk('Да, покажи.')
    await f.advance()
    f.alice.actor.position = { x: 1000, y: 1000 }
    f.provider.turns[1]?.resolve(
        npcReply(
            {
                type: 'quest_invitation_answer',
                targetId: f.alice.actor.id,
                invitationId: invitation.id,
                show: true,
            },
            { speech: 'Вот условия, посмотри.', taskAcceptance: 'none' }
        )
    )
    await f.advance()
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(f.speech().some((e) => e.text === 'Вот условия, посмотри.')).toBe(
        false
    )
    expect(f.provider.turns).toHaveLength(2)
})

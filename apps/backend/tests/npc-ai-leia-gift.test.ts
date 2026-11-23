import { afterEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { createItemInstance } from '../src/game/inventory'
import type { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom, openScenarioRoom } from './scenarioRoomHelpers'

const leiaId = 'npc_princess_1'
let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it.each(['whisper', 'chat'] as const)(
    'requires a delivered gift question and a later %s reply before accepting',
    async (channel) => {
        const provider = controlledNpcProvider()
        const turn = (index: number) => {
            const turn = provider.turns[index]
            if (turn === undefined) {
                throw new Error(`Missing model turn ${String(index)}`)
            }
            return turn
        }
        const game = openScenarioRoom({
            config: parseNpcAiConfig(
                {
                    proactive: false,
                    npcs: [{ actorId: leiaId, role: 'companion' }],
                },
                true
            ),
            provider: { decide: provider.decide },
        })
        room = game
        const leia = game.getCharacter(leiaId)
        if (leia === undefined) {
            throw new Error('Missing Leia')
        }
        const player = joinScenarioRoom(game, 'Sword giver')
        player.actor.position = { ...leia.position }
        const sword = createItemInstance('old_sword')
        player.actor.inventory.push(sword)
        const exchange = () => game.social.exchanges.snapshot(leia.id)
        const advance = () => vi.advanceTimersByTimeAsync(100)

        player.send({ type: 'exchange_invite', targetId: leia.id })
        await advance()
        const exchangeId = exchange()?.id ?? ''
        turn(0).resolve(
            npcReply({ type: 'exchange_answer', exchangeId, accept: true })
        )
        await advance()
        expect(exchange()).toMatchObject({ status: 'active' })

        player.send({
            type: 'exchange_offer',
            exchangeId,
            revision: exchange()?.revision ?? 0,
            gold: 0,
            items: [{ instanceId: sword.instanceId, quantity: 1 }],
        })
        await advance()
        const revision = exchange()?.revision ?? 0
        expect(turn(1).context.observation.social?.exchange).toMatchObject({
            other: { items: [{ instanceId: sword.instanceId }] },
        })
        player.send({
            type: 'whisper',
            targetId: leia.id,
            text: 'В дороге может понадобиться оружие.',
        })
        const accept = npcReply(
            { type: 'exchange_accept', exchangeId, revision },
            { speech: 'Благодарю, я беру меч.' }
        )
        turn(1).resolve(accept)
        await advance()
        expect(turn(2).context.replyCorrection?.reason?.code).toBe(
            'exchange_discussion'
        )
        expect(exchange()).toMatchObject({
            status: 'active',
            own: { accepted: false },
            other: { accepted: false },
        })
        expect(leia.inventory).not.toContainEqual(sword)
        expect(player.actor.inventory).toContainEqual(sword)

        const question = 'Зачем мне этот старый меч?'
        turn(2).resolve(npcReply(null, { speech: question }))
        await advance()
        expect(
            game.snapshot(Date.now(), player.actor.locationId, player.actor.id)
                .social?.privateMessages
        ).toContainEqual(
            expect.objectContaining({ senderId: leia.id, text: question })
        )
        turn(3).resolve(accept)
        await advance()
        expect(turn(4).context.replyCorrection?.reason?.detail).toContain(
            'Дождись ответа'
        )
        expect(leia.inventory).not.toContainEqual(sword)
        turn(4).resolve(npcReply(null, { speech: 'Слушаю тебя.' }))
        await advance()

        player.send({
            type: channel,
            targetId: leia.id,
            text: 'Возьми его в дорогу, чтобы защититься, если встретишь нежить.',
        })
        await advance()
        expect(turn(5).context.events[0]).toMatchObject({
            ...(channel === 'chat' ? { nearby: 'addressed' } : { channel }),
            exchangeOffer: { exchangeId },
        })
        turn(5).resolve(
            npcReply(
                { type: 'exchange_accept', exchangeId, revision },
                { speech: 'Тогда возьму его в дорогу. Благодарю.' }
            )
        )
        await advance()
        expect(exchange()).toMatchObject({
            status: 'active',
            own: { accepted: true },
        })
        player.send({ type: 'exchange_accept', exchangeId, revision })
        expect(exchange()).toMatchObject({ status: 'completed' })
        expect(leia.inventory).toContainEqual(sword)
        expect(player.actor.inventory).not.toContainEqual(sword)
    }
)

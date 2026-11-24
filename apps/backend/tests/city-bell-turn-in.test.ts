import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    actor,
    authoredDecision,
    placeForConversation,
    questId,
    required,
    setup,
    stopCityBellAiFixtures,
} from './cityBellAiFixture'
import { giveHearts } from './cityBellFixture'
import { miraId, npcReply } from './npcAiRuntimeFixture'
import { receivedSnapshot } from './snapshotTestHelpers'

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    await stopCityBellAiFixtures()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function clientView(f: ReturnType<typeof setup>): WorldSnapshot {
    return receivedSnapshot(f.player.sent)
}

it.each(['chat', 'whisper'] as const)(
    'accepts an AI-authored order and hands in through the player-visible %s confirmation, once',
    async (channel) => {
        const f = setup(miraId, 'city_coordinator')
        placeForConversation(f, actor(f, miraId))
        f.talk('Покажи условия задания колокола.')
        await f.advance()
        required(f.provider.turns[0]).resolve(
            npcReply(authoredDecision(f.player.actor.id), {
                speech: 'Нужны три сердца. Вот условия городского заказа.',
            })
        )
        await f.advance()
        const offer = required(clientView(f).social?.questOffer)
        f.player.send({
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: offer.revision,
            accept: true,
            rewardMode: 'submitter',
        })
        await f.advance()
        expect(clientView(f).adventure?.quest.status).toBe('active')
        // Inventory is test setup; acceptance, speech and confirmation use the real socket.
        giveHearts(f.player.actor)
        f.player.send({
            type: channel,
            targetId: miraId,
            text: 'Квест готов, хочу сдать три сердца.',
        })
        await f.advance()
        const ready = clientView(f)
        const prompt = required(ready.social?.questTurnIn)
        expect(prompt).toMatchObject({
            source: 'story',
            instanceId: `story:${f.player.actor.id}:${questId}`,
            rewardGold: 40,
            action: 'turn_in',
        })
        expect(ready.social?.whisper?.partnerId).toBe(miraId)
        const otherIssuer = actor(f, 'npc_cleric_1')
        const competingOffer = {
            ...offer,
            issuerId: otherIssuer.id,
            issuerName: otherIssuer.nickname,
        }
        const currentQuests = f.room.social.quests.snapshot(
            f.player.actor.id,
            Date.now()
        )
        const questSnapshot = vi
            .spyOn(f.room.social.quests, 'snapshot')
            .mockReturnValueOnce({
                ...currentQuests,
                questOffer: competingOffer,
            })
        const competing = f.room.social.snapshot(f.player.actor, Date.now())
        questSnapshot.mockRestore()
        expect(competing.questOffer?.issuerId).toBe(otherIssuer.id)
        expect(competing.questTurnIn?.issuerId).toBe(miraId)
        expect(competing.whisper?.partnerId).toBe(miraId)
        expect(ready.adventure?.gold).toBe(0)
        expect(f.player.actor.inventory).toHaveLength(3)
        const confirm = {
            type: 'quest_turn_in_confirm' as const,
            confirmationId: prompt.id,
            accept: true,
        }
        f.player.send(confirm)
        await f.advance()
        const completed = clientView(f)
        expect(completed.adventure).toMatchObject({
            gold: 40,
            quest: { status: 'completed' },
            cityState: { bellState: 'prepared' },
        })
        expect(completed.social?.questTurnIn).toBeNull()
        expect(f.player.actor.inventory).toHaveLength(0)
        f.player.send(confirm)
        await f.advance()
        expect(clientView(f).adventure?.gold).toBe(40)
        expect(f.player.actor.inventory).toHaveLength(0)
    }
)

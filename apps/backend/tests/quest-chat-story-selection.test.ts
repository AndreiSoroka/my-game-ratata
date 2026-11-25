import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    actor,
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

function clientView(f: ReturnType<typeof setup>) {
    return receivedSnapshot(f.player.sent)
}

it('opens the recently selected story quest after acceptance without asking for its name again', async () => {
    const f = setup(miraId, 'city_coordinator')
    placeForConversation(f, actor(f, miraId))
    f.talk('Хочу взять «Сердца для колокола памяти»')
    await f.advance()
    const offer = required(clientView(f).social?.questOffer)
    f.player.send({
        type: 'quest_offer_answer',
        offerId: offer.id,
        revision: offer.revision,
        accept: true,
    })
    await f.advance()
    f.talk('хочу сдать этот квест')
    await f.advance()
    const prompt = required(clientView(f).social?.questTurnIn)
    expect(prompt).toMatchObject({
        instanceId: 'story:' + f.player.actor.id + ':' + questId,
        canConfirm: false,
    })
    giveHearts(f.player.actor)
    f.talk('еще раз хочу сдать квест')
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toMatchObject({
        id: prompt.id,
        canConfirm: true,
    })
    expect(f.provider.turns).toHaveLength(0)
})

it('lets a fresh model reply open a canonical delivery prompt without completing it', async () => {
    const f = setup(miraId, 'city_coordinator')
    placeForConversation(f, actor(f, miraId))
    f.talk('Мира, вот заказ для колокола, забери его.')
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply(
            {
                type: 'quest_turn_in_request',
                targetId: f.player.actor.id,
                instanceId: questId,
            },
            {
                taskAcceptance: 'none',
                speech: 'Вот условия доставки.',
            }
        )
    )
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toMatchObject({
        instanceId: questId,
        preAcceptance: true,
        canConfirm: false,
    })
    expect(clientView(f).adventure?.gold).toBe(0)
})

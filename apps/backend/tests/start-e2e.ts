import { loadNpcAiConfig } from '../src/ai/config'
import type { NpcAiProvider } from '../src/ai/types'
import { startBackend } from '../src/startBackend'

const publishBoardDelivery = Bun.env['E2E_BOARD_DELIVERY'] === '1'
const boardDeliveryTitle = 'Хворост для городского склада'

const browserFixture: NpcAiProvider = {
    decide(context, _settings, signal) {
        signal.throwIfAborted()
        if (
            publishBoardDelivery &&
            context.actorId === 'npc_friendly_girl_1' &&
            context.events.some(
                (event) =>
                    event.kind === 'world' &&
                    (event.reason === 'city_review' ||
                        event.reason === 'city_changed')
            ) &&
            context.observation.city?.publishedOrders?.some(
                (order) => order.title === boardDeliveryTitle
            ) !== true
        ) {
            return Promise.resolve({
                decision: {
                    type: 'quest_board_publish',
                    draft: {
                        title: boardDeliveryTitle,
                        description: 'Принесите хворост в городской запас.',
                        objectives: [
                            {
                                kind: 'deliver',
                                itemId: 'brushwood',
                                quantity: 1,
                                recipientId: 'city:map-2-2',
                            },
                        ],
                        rewardGold: 5,
                        rewardItems: [],
                        funding: 'city',
                    },
                },
                memory: '',
                done: true,
                waitMs: 0,
                taskAcceptance: 'none',
                companionOrder: null,
                speech: null,
            })
        }
        const follows =
            context.commandCapabilities?.orders.follow?.allowed === true &&
            context.events.some(
                (event) =>
                    event.kind === 'message' &&
                    (event.text.startsWith('Пойдём вместе:') ||
                        event.text.startsWith('Come with me,'))
            )
        const english = context.speechLanguage === 'en'
        const hasMessage = context.events.some(
            (event) => event.kind === 'message'
        )
        const speech = follows
            ? english
                ? 'I would be happy to come with you.'
                : 'Согласен идти вместе.'
            : english
              ? 'I’m listening. How can I help?'
              : 'Я слушаю. Чем тебе помочь?'
        return Promise.resolve({
            decision: null,
            memory: '',
            done: true,
            waitMs: 0,
            taskAcceptance: follows ? 'accept' : 'none',
            companionOrder: follows ? 'follow' : null,
            speech: !publishBoardDelivery || hasMessage ? speech : null,
        })
    },
}

await startBackend(async () => {
    const config = await loadNpcAiConfig({})
    return {
        config: {
            ...config,
            proactive: publishBoardDelivery,
            ...(publishBoardDelivery
                ? { limits: { ...config.limits, reviewIntervalMs: 2_000 } }
                : {}),
        },
        name: 'browser fixture',
        provider: browserFixture,
    }
})

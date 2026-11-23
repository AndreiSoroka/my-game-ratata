import { loadNpcAiConfig } from '../src/ai/config'
import type { NpcAiProvider } from '../src/ai/types'
import { startBackend } from '../src/startBackend'

const browserFixture: NpcAiProvider = {
    decide(context, _settings, signal) {
        signal.throwIfAborted()
        const follows =
            context.commandCapabilities?.orders.follow?.allowed === true &&
            context.events.some(
                (event) =>
                    event.kind === 'message' &&
                    (event.text.startsWith('Пойдём вместе:') ||
                        event.text.startsWith('Come with me,'))
            )
        const english = context.speechLanguage === 'en'
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
            speech,
        })
    },
}

await startBackend(async () => ({
    config: { ...(await loadNpcAiConfig({})), proactive: false },
    name: 'browser fixture',
    provider: browserFixture,
}))

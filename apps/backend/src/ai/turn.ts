import type { NpcAiActorState } from './runtimeState'
import type { NpcAiContext, NpcAiProvider } from './types'

/** Abort is also observed here so a faulty provider cannot retain the queue forever. */
export async function invokeNpcAiTurn(
    state: NpcAiActorState,
    context: NpcAiContext,
    provider: NpcAiProvider,
    current: () => boolean
): Promise<void> {
    const generation = state.generation
    const events = state.dialogue === undefined ? state.events.splice(0) : []
    const controller = new AbortController()
    state.controller = controller
    const timeout = setTimeout(
        () => controller.abort(),
        state.config.settings.timeoutMs
    )
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error('Model turn cancelled or timed out'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
        const reply = await Promise.race([
            Promise.resolve().then(() => {
                controller.signal.throwIfAborted()
                return provider.decide(
                    context,
                    state.config.settings,
                    controller.signal
                )
            }),
            aborted,
        ])
        if (
            current() &&
            state.generation === generation &&
            !controller.signal.aborted
        ) {
            state.ready = { reply }
        }
    } catch (error) {
        if (current() && state.generation === generation) {
            state.ready = {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Model invocation failed',
                events,
            }
        }
    } finally {
        clearTimeout(timeout)
        if (onAbort !== undefined) {
            controller.signal.removeEventListener('abort', onAbort)
        }
        if (state.controller === controller) {
            state.controller = undefined
        }
    }
}

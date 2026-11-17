import { boundedNpcContext } from './dialogueContext'
import type { NpcAiActorState } from './runtimeState'
import {
    inputSource,
    reserveInputCall,
    resolveTurnInformation,
    type TurnInformation,
} from './turnInformation'
import type { NpcAiContext, NpcAiProvider } from './types'

/** One lookup may augment the original turn; neither lookup nor provider can execute game actions. */
export async function invokeNpcAiTurn(
    state: NpcAiActorState,
    context: NpcAiContext,
    provider: NpcAiProvider,
    current: () => boolean,
    information: TurnInformation = {}
): Promise<void> {
    const generation = state.generation
    const sourceId = inputSource(state, context)
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
    const decide = (input: NpcAiContext) =>
        Promise.race([
            Promise.resolve().then(() => {
                controller.signal.throwIfAborted()
                reserveInputCall(state, sourceId)
                return provider.decide(
                    boundedNpcContext(input),
                    state.config.settings,
                    controller.signal
                )
            }),
            aborted,
        ])
    try {
        const reply = await resolveTurnInformation(
            state,
            context,
            information,
            decide,
            aborted
        )
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

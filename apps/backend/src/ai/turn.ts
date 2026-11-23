import { boundedNpcContext } from './dialogueContext'
import type { NpcAiActorState } from './runtimeState'
import { NpcReplyRejected } from './taskConsent'
import {
    correctReply,
    inputSource,
    reserveInputCall,
    resolveTurnInformation,
    type TurnInformation,
} from './turnInformation'
import type { NpcAiContext, NpcAiProvider, NpcAiReply } from './types'

/** One lookup may augment the original turn; neither lookup nor provider can execute game actions. */
export async function invokeNpcAiTurn(
    state: NpcAiActorState,
    context: NpcAiContext,
    provider: NpcAiProvider,
    current: () => boolean,
    information: TurnInformation = {},
    wallNow = Date.now
): Promise<void> {
    const generation = state.generation
    const memory = state.mind
    const retirementRevision = memory.retirementRevision
    const sourceId = inputSource(state, context)
    const events = state.dialogue === undefined ? state.events.splice(0) : []
    const controller = new AbortController()
    state.controller = controller
    const timeout = setTimeout(
        () => controller.abort(),
        turnTimeout(state, wallNow())
    )
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error('Model turn cancelled or timed out'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    const decide = turnDecider(
        state,
        sourceId,
        provider,
        controller.signal,
        aborted
    )
    const turnInformation: TurnInformation = {
        ...information,
        reserveCall: () =>
            (state.modelCallsByInput.get(sourceId) ?? 0) < 2 &&
            information.reserveCall?.() === true,
    }
    try {
        const reply = await resolveTurnInformation(
            state,
            context,
            turnInformation,
            decide,
            aborted
        )
        if (
            state.mind !== memory ||
            memory.retirementRevision !== retirementRevision
        ) {
            throw new NpcReplyRejected('memory_changed')
        }
        if (
            await commitTurnReply(
                context,
                reply,
                turnInformation,
                decide,
                aborted
            )
        ) {
            return
        }
        storeReply(state, reply, controller.signal, generation, current)
    } catch (error) {
        if (current() && state.generation === generation) {
            state.ready = failedTurn(error, events)
        }
    } finally {
        clearTimeout(timeout)
        if (onAbort !== undefined) {
            controller.signal.removeEventListener('abort', onAbort)
        }
        if (state.controller === controller) {
            state.controller = undefined
            state.finalizing = undefined
        }
    }
}

function turnTimeout(state: NpcAiActorState, wallNow: number): number {
    const remaining = (state.dialogue?.replyDeadline ?? Infinity) - wallNow
    return Math.max(0, Math.min(state.config.settings.timeoutMs, remaining))
}

function failedTurn(
    error: unknown,
    events: Array<import('./types').NpcAiEvent>
): NonNullable<NpcAiActorState['ready']> {
    return error instanceof NpcReplyRejected
        ? { invalidReply: error.code }
        : {
              error:
                  error instanceof Error
                      ? error.message
                      : 'Model invocation failed',
              events,
          }
}

function turnDecider(
    state: NpcAiActorState,
    sourceId: string,
    provider: NpcAiProvider,
    signal: AbortSignal,
    aborted: Promise<never>
) {
    return (input: NpcAiContext) =>
        Promise.race([
            Promise.resolve().then(() => {
                signal.throwIfAborted()
                reserveInputCall(state, sourceId)
                return provider.decide(
                    boundedNpcContext(input),
                    state.config.settings,
                    signal
                )
            }),
            aborted,
        ])
}

async function commitTurnReply(
    context: NpcAiContext,
    reply: NpcAiReply,
    information: TurnInformation,
    decide: (context: NpcAiContext) => Promise<NpcAiReply>,
    aborted: Promise<never>
): Promise<boolean> {
    if (information.commitReply === undefined) {
        return false
    }
    let problem = await Promise.race([information.commitReply(reply), aborted])
    if (problem !== undefined) {
        const corrected = await correctReply(
            context,
            reply,
            information,
            decide,
            problem
        )
        problem = await Promise.race([
            information.commitReply(corrected),
            aborted,
        ])
        if (problem !== undefined) {
            throw new NpcReplyRejected(problem.code)
        }
    }
    return true
}

function storeReply(
    state: NpcAiActorState,
    reply: NpcAiReply,
    signal: AbortSignal,
    generation: number,
    current: () => boolean
): void {
    if (current() && state.generation === generation && !signal.aborted) {
        state.ready = { reply }
    }
}

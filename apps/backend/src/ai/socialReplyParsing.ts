import type { NpcAiReply } from './types'
export function parseSocialReply(
    input: Record<string, unknown>
): Pick<
    NpcAiReply,
    'speech' | 'taskAcceptance' | 'companionOrder' | 'waitMode'
> {
    const speech = input['speech']
    const taskAcceptance = input['taskAcceptance']
    const companionOrder = input['companionOrder']
    if (!validSpeech(speech)) {
        throw new Error('Invalid NPC speech')
    }
    if (taskAcceptance !== undefined && !isAcceptance(taskAcceptance)) {
        throw new Error('Invalid NPC task acceptance')
    }
    if (
        companionOrder !== undefined &&
        companionOrder !== null &&
        !isOrder(companionOrder)
    ) {
        throw new Error('Invalid NPC companion order')
    }
    return {
        ...(speech === undefined ? {} : { speech }),
        ...(taskAcceptance === undefined ? {} : { taskAcceptance }),
        ...(companionOrder === undefined ? {} : { companionOrder }),
        ...parseWaitMode(input['waitMode']),
    }
}

function isAcceptance(
    value: unknown
): value is NonNullable<NpcAiReply['taskAcceptance']> {
    return (
        value === 'none' ||
        value === 'accept' ||
        value === 'replace' ||
        value === 'decline'
    )
}
function isOrder(
    value: unknown
): value is NonNullable<NpcAiReply['companionOrder']> {
    return (
        value === 'follow' ||
        value === 'guard' ||
        value === 'help' ||
        value === 'dismiss' ||
        value === 'wait'
    )
}

function validSpeech(value: unknown): value is string | null | undefined {
    return (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.length <= 400)
    )
}

function parseWaitMode(value: unknown): Pick<NpcAiReply, 'waitMode'> {
    if (value === undefined) {
        return {}
    }
    if (
        value !== null &&
        value !== 'until_request' &&
        value !== 'until_return'
    ) {
        throw new Error('Invalid NPC wait mode')
    }
    return { waitMode: value }
}

import type { PersonMemoryUpdate } from './characterMemory'
import type { NpcAiReply } from './types'

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function id(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 150
}
function sourceIds(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= 40 &&
        value.every(id)
    )
}
function personUpdate(value: unknown): PersonMemoryUpdate {
    if (
        !record(value) ||
        Object.keys(value).length !== 4 ||
        !id(value['personId']) ||
        !id(value['throughMessageId']) ||
        typeof value['text'] !== 'string' ||
        value['text'].length > 2000 ||
        !sourceIds(value['sourceMessageIds'])
    ) {
        throw new Error('Invalid person memory update')
    }
    return {
        personId: value['personId'],
        throughMessageId: value['throughMessageId'],
        text: value['text'],
        sourceMessageIds: value['sourceMessageIds'],
    }
}
export function parseInformation(
    input: Record<string, unknown>
): Pick<NpcAiReply, 'informationRequest' | 'personMemoryUpdate'> {
    const result: Pick<
        NpcAiReply,
        'informationRequest' | 'personMemoryUpdate'
    > = {}
    const request = input['informationRequest']
    if (request != null) {
        if (
            !record(request) ||
            request['type'] !== 'deep_memory' ||
            !id(request['personId']) ||
            Object.keys(request).length !== 2
        ) {
            throw new Error('Invalid information request')
        }
        result.informationRequest = {
            type: 'deep_memory',
            personId: request['personId'],
        }
    }
    if (input['personMemoryUpdate'] != null) {
        result.personMemoryUpdate = personUpdate(input['personMemoryUpdate'])
    }
    return result
}

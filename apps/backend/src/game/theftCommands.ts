import type { TheftClientMessage } from '@my-game-ratata/contracts'

export function isTheftCommand(message: {
    type: string
}): message is TheftClientMessage {
    return isTheftCommandType(message.type)
}

export function isTheftCommandType(
    type: unknown
): type is TheftClientMessage['type'] {
    return (
        type === 'steal' ||
        type === 'call_guards' ||
        type === 'report_theft' ||
        type === 'absolve'
    )
}

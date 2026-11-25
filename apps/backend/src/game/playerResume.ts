import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
    isPlayerResumeToken,
    type JoinClientMessage,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { normalizeNickname } from './identity'
import type { JoinContext } from './roomIdentity'
import type { RoomSocket } from './roomMessaging'

interface ResolvedJoin {
    nicknameKey: string
    savedToken: string | undefined
    existingCharacter: GameCharacter | undefined
}

interface RejectedJoin {
    code: string
    message: string
}

export function resolveJoin(
    context: JoinContext,
    ws: RoomSocket,
    message: JoinClientMessage
): ResolvedJoin | RejectedJoin {
    const nicknameKey = normalizeNickname(message.nickname)
    const existingId = context.nicknames.get(nicknameKey)
    const existingCharacter =
        existingId === undefined
            ? undefined
            : context.characters.get(existingId)
    const savedToken =
        existingCharacter === undefined
            ? undefined
            : context.resumeTokens?.get(existingCharacter)
    const occupied =
        existingId !== undefined &&
        isPlayerConnected(context.connections, existingId, ws)
    const rejectedResume = checkResume(
        message.resumeToken,
        savedToken,
        occupied,
        existingCharacter
    )
    if (rejectedResume !== undefined) {
        return rejectedResume
    }
    if (
        occupied ||
        (message.resumeToken === undefined && savedToken !== undefined) ||
        createOnlyNameTaken(context.characters, nicknameKey, message.createOnly)
    ) {
        return {
            code: 'name_taken',
            message: 'Это имя уже занято. Сгенерируйте другое или введите своё',
        }
    }
    return { nicknameKey, savedToken, existingCharacter }
}

function checkResume(
    supplied: string | undefined,
    saved: string | undefined,
    occupied: boolean,
    actor: GameCharacter | undefined
): RejectedJoin | undefined {
    if (supplied === undefined) {
        return undefined
    }
    if (
        saved === undefined ||
        !isPlayerResumeToken(supplied) ||
        actor?.tags.has('state.retired') === true ||
        !timingSafeEqual(Buffer.from(saved), Buffer.from(supplied))
    ) {
        return {
            code: 'resume_invalid',
            message: 'Сохранённый вход в эту жизнь больше недоступен.',
        }
    }
    if (occupied) {
        return {
            code: 'resume_busy',
            message: 'Персонаж ещё подключён в другой вкладке.',
        }
    }
    return undefined
}

export function requestedResumeToken(
    context: JoinContext,
    message: JoinClientMessage
): string | undefined {
    return context.resumeTokens !== undefined &&
        message.requestResumeToken === true
        ? randomBytes(32).toString('base64url')
        : undefined
}

function createOnlyNameTaken(
    characters: ReadonlyMap<string, GameCharacter>,
    nicknameKey: string,
    createOnly: boolean | undefined
): boolean {
    return (
        createOnly === true &&
        [...characters.values()].some(
            (character) => normalizeNickname(character.nickname) === nicknameKey
        )
    )
}

export function isPlayerConnected(
    connections: Map<RoomSocket, string | undefined>,
    playerId: string,
    exceptWs: RoomSocket
): boolean {
    for (const [connection, connectedPlayerId] of connections) {
        if (connection !== exceptWs && connectedPlayerId === playerId) {
            return true
        }
    }
    return false
}

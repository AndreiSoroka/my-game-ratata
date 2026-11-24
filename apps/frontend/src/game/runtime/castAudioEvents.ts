import { type AbilityId, type GameEventPayload, isPrayerAction } from '@my-game-ratata/contracts'

export type CastSound = 'magicCast' | 'prayerWhisper' | 'sparkFlight'

export function eventReceipt(
    event: GameEventPayload,
    sound: CastSound,
    serverTime: number
): string {
    const identity = event.actionId ?? event.eventId ?? serverTime
    return JSON.stringify(['event', event.actorId, event.kind, event.abilityId, sound, identity])
}

export function endedSparkWhisperReceipt(
    event: GameEventPayload,
    serverTime: number
): string | undefined {
    if (
        event.abilityId === 'spark' &&
        isMagicCastAttack(event) &&
        (event.phase === 'completed' || event.phase === 'interrupted') &&
        event.actionId !== undefined
    )
        return eventReceipt(event, 'magicCast', serverTime)
}

export function isMagicCastAttack(event: GameEventPayload): boolean {
    return (
        event.kind === 'attack' &&
        event.delivery === 'magic' &&
        (event.abilityId === 'spark' ||
            event.abilityId === 'fireball' ||
            event.abilityId === 'greater_fireball' ||
            event.abilityId === 'ash_exhaustion')
    )
}

export function instantSound(event: GameEventPayload): CastSound | undefined {
    switch (event.kind) {
        case 'attack':
            return magicAttackSound(event)
        case 'status':
            return event.statusId === 'barrier' && event.abilityId === 'barrier'
                ? 'magicCast'
                : undefined
        case 'cast':
            return completedCastSound(event)
        default:
            return undefined
    }
}

function magicAttackSound(event: GameEventPayload): CastSound | undefined {
    if (!isMagicCastAttack(event)) return undefined
    if (event.abilityId === 'spark') {
        if (event.phase === 'started') return 'magicCast'
        return event.phase === undefined || (event.phase === 'completed' && event.projectile)
            ? 'sparkFlight'
            : undefined
    }
    if (event.abilityId === 'ash_exhaustion') {
        return event.phase === undefined || event.phase === 'completed' ? 'sparkFlight' : undefined
    }
    return event.phase === undefined || event.phase === 'started' ? 'magicCast' : undefined
}

function completedCastSound(event: GameEventPayload): CastSound | undefined {
    if (event.phase !== 'completed') return undefined
    if (event.abilityId === 'blink' || event.abilityId === 'dispel_magic') return 'magicCast'
    if (event.castMode === 'devotion' && isPrayerAction(event.abilityId)) return 'prayerWhisper'
    return undefined
}

export function isChannelEnd(event: GameEventPayload, abilityId: AbilityId): boolean {
    return (
        event.kind === 'cast' &&
        event.castMode !== 'devotion' &&
        (event.phase === 'interrupted' || event.phase === 'completed') &&
        (isPrayerAction(abilityId) ||
            abilityId === 'chains' ||
            abilityId === 'city_portal' ||
            abilityId === 'ash_exhaustion' ||
            abilityId === 'ash_tame')
    )
}

export function removedActor(event: GameEventPayload): string | undefined {
    if (event.kind === 'death') return event.targetId
    if (event.kind === 'permadeath' || event.kind === 'leave') return event.actorId
    return undefined
}

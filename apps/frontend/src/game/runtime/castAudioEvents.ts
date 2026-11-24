import { type AbilityId, type GameEventPayload, isPrayerAction } from '@my-game-ratata/contracts'

export type CastSound = 'magicCast' | 'prayerWhisper' | 'sparkFlight'

export function isMagicCastAttack(event: GameEventPayload): boolean {
    return (
        event.kind === 'attack' &&
        event.delivery === 'magic' &&
        (event.abilityId === 'spark' ||
            event.abilityId === 'fireball' ||
            event.abilityId === 'greater_fireball')
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
        // Spark's current server event is unphased and starts the visible projectile immediately.
        return event.phase === undefined || (event.phase === 'completed' && event.projectile)
            ? 'sparkFlight'
            : undefined
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
        (isPrayerAction(abilityId) || abilityId === 'chains' || abilityId === 'city_portal')
    )
}

export function removedActor(event: GameEventPayload): string | undefined {
    if (event.kind === 'death') return event.targetId
    if (event.kind === 'permadeath' || event.kind === 'leave') return event.actorId
    return undefined
}

import type {
    GameEventPayload,
    MagicChannelSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'
import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { MagicCombat } from './magicCombat'
import { distance } from './math'
import type { NavigationService } from './navigation'

interface ChannelBase extends MagicChannelSnapshot {
    locationId: string
    center: Vector2
}

export interface ChainsChannel extends ChannelBase {
    abilityId: 'chains'
    radius: number
    manaPerSecond: number
    chargedThrough: number
    practiced: boolean
    partyImmune: boolean
    sameParty?: (first: string, second: string) => boolean
    navigation: NavigationService
}

interface PortalChannel extends ChannelBase {
    abilityId: 'city_portal'
}

export type MagicChannel = ChainsChannel | PortalChannel

const channels = new WeakMap<GameCharacter, MagicChannel>()
const combatByActor = new WeakMap<GameCharacter, MagicCombat>()

export function bindMagicCombat(
    combat: MagicCombat,
    actors: Iterable<GameCharacter>
): void {
    for (const actor of actors) {
        combatByActor.set(actor, combat)
    }
}

export function magicCombatFor(actor: GameCharacter): MagicCombat | undefined {
    return combatByActor.get(actor)
}

export function magicAttackWindingUp(actor: GameCharacter): boolean {
    return magicCombatFor(actor)?.isWindingUp(actor) === true
}

export function magicChannelFor(
    actor: GameCharacter
): MagicChannel | undefined {
    return channels.get(actor)
}

export function canMaintainMagic(
    actor: GameCharacter,
    channel: MagicChannel,
    now: number
): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (actor.controllerKind !== 'network_player' || actor.connected) &&
        actor.stunUntil <= now &&
        channel.locationId === actor.locationId &&
        distance(actor.position, channel.center) < 1e-8
    )
}

export function activeMagicChannel(actor: GameCharacter, now: number) {
    const channel = channels.get(actor)
    return channel !== undefined &&
        now < channel.completesAt &&
        canMaintainMagic(actor, channel, now)
        ? channel
        : undefined
}

export function snapshotMagicChannel(
    actor: GameCharacter,
    now: number
): MagicChannelSnapshot | undefined {
    const channel = activeMagicChannel(actor, now)
    if (channel === undefined) {
        return undefined
    }
    return {
        abilityId: channel.abilityId,
        startedAt: channel.startedAt,
        completesAt: channel.completesAt,
        ...(channel.abilityId === 'chains' ? { radius: channel.radius } : {}),
    }
}

export function startMagicChannel(
    actor: GameCharacter,
    channel: MagicChannel
): GameEventPayload[] {
    const { abilityId, startedAt, completesAt } = channel
    channels.set(actor, channel)
    if (channel.abilityId === 'chains') {
        magicCombatFor(actor)?.addChannel(actor, channel.locationId)
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    actor.movement.dashUntil = 0
    actor.velocity = { x: 0, y: 0 }
    actor.setAnimation('attack', startedAt, completesAt - startedAt)
    return [
        {
            kind: 'cast',
            abilityId,
            actorId: actor.id,
            phase: 'started',
            expiresAt: completesAt,
            durationMs: completesAt - startedAt,
        },
    ]
}

export function finishMagicChannel(
    actor: GameCharacter,
    now: number,
    phase: 'completed' | 'interrupted'
): GameEventPayload[] {
    const channel = channels.get(actor)
    if (channel === undefined) {
        return []
    }
    if (channel.abilityId === 'chains') {
        chargeChainsThrough(actor, channel, now)
        actor.abilities.availableAt.chains =
            now + ABILITY_DEFINITIONS.chains.cooldownMs
    }
    clearMagicChannel(actor)
    if (actor.alive && actor.animationAction === 'attack') {
        actor.animationUntil = now
        actor.setAnimation('idle', now)
    }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: channel.abilityId,
            phase,
        },
    ]
}

export function clearMagicChannel(actor: GameCharacter): void {
    const channel = channels.get(actor)
    if (channel !== undefined) {
        channels.delete(actor)
        if (channel.abilityId === 'chains') {
            magicCombatFor(actor)?.removeChannel(actor, channel.locationId)
        }
    }
}

export function chargeChainsThrough(
    actor: GameCharacter,
    channel: ChainsChannel,
    now: number
): boolean {
    const through = Math.min(now, channel.completesAt)
    const charge =
        (Math.max(0, through - channel.chargedThrough) / 1000) *
        channel.manaPerSecond
    channel.chargedThrough = Math.max(channel.chargedThrough, through)
    const paid = actor.mana + 1e-8 >= charge
    actor.mana = Math.max(0, actor.mana - charge)
    return paid
}

export function cancelMagicChannel(actor: GameCharacter, now: number) {
    return finishMagicChannel(actor, now, 'interrupted')
}

export function cancelMagicForMovement(
    actor: GameCharacter,
    axis: Vector2,
    now: number
): GameEventPayload[] {
    return axis.x === 0 && axis.y === 0 ? [] : cancelMagicChannel(actor, now)
}

export function magicRootedUntil(
    actor: GameCharacter,
    now: number,
    position = actor.position
): number {
    let until = 0
    for (const { channel } of chainsAt(actor, now, position)) {
        until = Math.max(until, channel.completesAt)
    }
    return until
}

export function* chainsAt(
    actor: GameCharacter,
    now: number,
    position = actor.position
) {
    if (!actor.alive || actor.trainingTarget !== undefined) {
        return
    }
    for (const caster of magicCombatFor(actor)?.channelsIn(actor.locationId) ??
        []) {
        const channel = activeMagicChannel(caster, now)
        if (
            channel?.abilityId === 'chains' &&
            chainsReach(channel, caster, actor, position)
        ) {
            yield { caster, channel }
        }
    }
}

function chainsReach(
    channel: ChainsChannel,
    caster: GameCharacter,
    actor: GameCharacter,
    position: Vector2
): boolean {
    return (
        distance(channel.center, position) <= channel.radius + 1e-8 &&
        channel.navigation.hasLineOfSight(channel.center, position) &&
        (caster === actor ||
            !channel.partyImmune ||
            channel.sameParty?.(caster.id, actor.id) !== true)
    )
}

export function magicBlocksMovement(
    actor: GameCharacter,
    now: number
): boolean {
    return (
        activeMagicChannel(actor, now) !== undefined ||
        magicRootedUntil(actor, now) > now
    )
}

/** A dash, lunge or Blink cannot skip past a field between simulation ticks. */
export function limitMovementByChains(
    actor: GameCharacter,
    end: Vector2,
    now: number
): Vector2 {
    if ((magicCombatFor(actor)?.channelsIn(actor.locationId).size ?? 0) === 0) {
        return end
    }
    const start = actor.position
    const steps = Math.ceil(distance(start, end) / 2)
    for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps
        const position = {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio,
        }
        if (magicRootedUntil(actor, now, position) > now) {
            return position
        }
    }
    return end
}

export function magicManaRegenSuppressed(
    actor: GameCharacter,
    now: number
): boolean {
    return activeMagicChannel(actor, now) !== undefined
}

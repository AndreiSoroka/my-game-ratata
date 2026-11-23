import {
    type GameEventPayload,
    isItemBroken,
    type Vector2,
} from '@my-game-ratata/contracts'

import { agentSpeech } from './agentSpeech'
import type { GameCharacter } from './character'
import type { ReactionAction } from './characterReactions'
import { canUseCombat } from './combatPermission'
import {
    canWitnessCombatant,
    canWitnessPoint,
    publicCombatHit,
} from './combatWitnesses'
import { escapePoint } from './crimeResponses'
import { available, humanControlled } from './crimeRules'
import { combatFaction } from './factions'
import { distance } from './math'
import type { NpcConflictIdentity } from './npcConflictResponses'
import { NPC_OBSERVATION_RADIUS } from './queries'
import type { GameRoom } from './room'
import type { SocialHistory } from './socialHistory'
import type { SocialIncident, SocialSeverity } from './socialHistoryTypes'
import { canHearSpeech } from './socialSpeech'

export type ObservedConflict = SocialIncident & { kind: 'theft' | 'attack' }

export function noticedTheftIncident(
    thief: GameCharacter,
    victim: GameCharacter,
    now: number
): ObservedConflict {
    return {
        id: `theft:${thief.id}:${victim.id}:${String(now)}`,
        kind: 'theft',
        actorId: thief.id,
        targetId: victim.id,
        locationId: victim.locationId,
        at: now,
        severity: 3,
    }
}

export function chooseObservedConflict(
    room: GameRoom,
    history: SocialHistory,
    actor: GameCharacter,
    offender: GameCharacter,
    incident: ObservedConflict,
    options: {
        actions: readonly ReactionAction[]
        now: number
        revision: string | number
        random?: (() => number) | undefined
    }
): ReactionAction {
    return actor.temperament.react(
        {
            incidentId: incident.id,
            trigger: incident.kind,
            sourceId: offender.id,
            severity: incident.severity * 20,
            revision: options.revision,
            available: options.actions,
            context: {
                ...history.relationship(actor.id, offender.id, options.now),
                ...history.knownReputation(
                    actor.id,
                    incident.locationId,
                    offender.id
                ),
                healthFraction: actor.hp / actor.maxHp,
                threat: perceivedThreat(offender, incident.kind),
                allies: visibleAllies(room, actor, offender, options.now),
            },
        },
        options.now,
        options.random
    ).action
}

export function observedAttack(
    room: GameRoom,
    characters: Iterable<GameCharacter>,
    event: GameEventPayload,
    now: number
) {
    const hit = publicCombatHit(room, event)
    if (hit === undefined || !socialAttack(hit.attacker, hit.target)) {
        return undefined
    }
    const { attacker, target: victim, amount, impact } = hit
    const incident: ObservedConflict = {
        id: `attack:${hit.id}`,
        kind: 'attack',
        actorId: attacker.id,
        targetId: victim.id,
        locationId: victim.locationId,
        at: now,
        severity: damageSeverity(amount, victim.maxHp),
    }
    const navigation = room.navigationFor(victim)
    const visible = (observer: GameCharacter, subject: GameCharacter) =>
        canWitnessCombatant(
            observer,
            subject,
            navigation,
            NPC_OBSERVATION_RADIUS,
            now
        )
    const victimSawAttacker = visible(victim, attacker)
    const witnesses = [...characters]
        .filter(
            (observer) =>
                observer !== victim &&
                observer !== attacker &&
                observer.soul.canSpeak &&
                available(observer) &&
                observer.locationId === victim.locationId &&
                canWitnessPoint(
                    observer,
                    impact,
                    navigation,
                    NPC_OBSERVATION_RADIUS
                ) &&
                visible(observer, victim) &&
                visible(observer, attacker)
        )
        .map((observer) => observer.id)
    if (victimSawAttacker) {
        witnesses.push(victim.id)
    }
    return { attacker, victim, incident, victimSawAttacker, witnesses }
}

function visibleAllies(
    room: GameRoom,
    actor: GameCharacter,
    opponent: GameCharacter,
    now: number
): number {
    const navigation = room.navigationFor(actor)
    return room
        .charactersFor(actor)
        .filter(
            (candidate) =>
                candidate !== actor &&
                candidate !== opponent &&
                available(candidate) &&
                candidate.faction === actor.faction &&
                canUseCombat(candidate) &&
                canWitnessCombatant(actor, candidate, navigation, 96, now)
        ).length
}

function socialAttack(attacker: GameCharacter, victim: GameCharacter): boolean {
    return (
        attacker !== victim &&
        combatFaction(attacker) === 'peaceful' &&
        victim.soul.canSpeak &&
        victim.faction === 'peaceful'
    )
}

function damageSeverity(damage: number, maxHp: number): SocialSeverity {
    const fraction = damage / maxHp
    if (fraction >= 0.45) {
        return 5
    }
    if (fraction >= 0.25) {
        return 4
    }
    return fraction >= 0.1 ? 3 : 2
}

export function canReact(
    actor: GameCharacter,
    offender: GameCharacter,
    locationId: string
): boolean {
    return (
        available(actor) &&
        !humanControlled(actor) &&
        available(offender) &&
        actor !== offender &&
        actor.locationId === locationId &&
        offender.locationId === locationId
    )
}

export function canFight(
    actor: GameCharacter,
    offender: GameCharacter
): boolean {
    return (
        actor.soul.companion?.leaderId !== offender.id &&
        canUseCombat(actor) &&
        (actor.equipment.weapon === undefined ||
            !isItemBroken(actor.equipment.weapon))
    )
}

function perceivedThreat(
    offender: GameCharacter,
    trigger: 'theft' | 'attack'
): number {
    return (
        (trigger === 'attack' ? 55 : 20) +
        (offender.equipment.weapon === undefined ? 0 : 20)
    )
}

export function warnConflict(
    room: GameRoom,
    actor: GameCharacter,
    offender: GameCharacter,
    kind: NpcConflictIdentity['kind'],
    now: number
): GameEventPayload[] {
    const text =
        kind === 'theft'
            ? 'Я заметил попытку кражи. Больше не подходи.'
            : 'Держись подальше.'
    return agentSpeech(
        actor,
        { type: 'speak', targetId: offender.id, text },
        room,
        now
    ).events
}

export function claimReaction(
    receipts: WeakMap<GameCharacter, Set<string>>,
    actor: GameCharacter,
    id: string
): boolean {
    const known = receipts.get(actor) ?? new Set<string>()
    if (known.has(id)) {
        return false
    }
    known.add(id)
    receipts.set(actor, known)
    return true
}

export function availableConflictActions(
    room: GameRoom,
    actor: GameCharacter,
    offender: GameCharacter,
    now: number,
    observed: {
        visible: boolean
        lastKnown?: Vector2 | undefined
        reportAvailable: () => boolean
    }
): ReactionAction[] {
    const actions: ReactionAction[] = ['wait']
    if (!canReact(actor, offender, actor.locationId)) {
        return actions
    }
    if (observed.visible && canFight(actor, offender)) {
        actions.push('attack')
    }
    const threat = observed.visible ? offender.position : observed.lastKnown
    if (threat !== undefined && canFlee(room, actor, threat)) {
        actions.push('flee')
    }
    if (
        observed.visible &&
        canHearSpeech(offender, actor, room.navigationFor(actor), now, 64)
    ) {
        actions.push('warn')
    }
    if (observed.reportAvailable()) {
        actions.push('report')
    }
    return actions
}

export function canFlee(
    room: GameRoom,
    actor: GameCharacter,
    threat: Vector2
): boolean {
    return distance(actor.position, escapePoint(actor, threat, room)) > 1
}

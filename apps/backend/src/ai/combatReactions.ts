import {
    type GameEventPayload,
    PUBLIC_SPEECH_RADIUS,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { visibilityRadius } from '../game/characterSight'
import { visibleBuildingPoint } from '../game/mapBuildings'
import { distance } from '../game/math'
import type { NavigationService } from '../game/navigation'
import type { GameRoom } from '../game/room'
import { speechAvailable } from '../game/socialSpeech'
import { createSpeechEvent } from '../game/speechReceipts'
import type { NpcAiObservation } from './observationTypes'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiContext, NpcAiReply, NpcAiTask } from './types'

const reactionCooldownMs = 60_000
const reactionWindowMs = 15_000

interface CombatWitness {
    actor: GameCharacter
    locationId: string
    deathSequence: number
    impact: Vector2
}

const witnesses = new WeakMap<NpcAiTask, CombatWitness>()
const lastLaunch = new WeakMap<GameCharacter, number>()

export function queueNpcCombatReactions(
    room: GameRoom,
    states: Iterable<NpcAiActorState>,
    events: readonly GameEventPayload[],
    now: number,
    nextId: () => string
): void {
    const wallNow = room.realNow()
    for (const event of events) {
        const hit = publicCombatHit(room, event)
        if (hit === undefined) {
            continue
        }
        const { attacker, target, impact } = hit
        const seen = {
            kind: 'combat_hit' as const,
            id: nextId(),
            attacker: combatant(attacker),
            target: combatant(target),
            at: now,
        }
        const navigation = room.navigationFor(target)
        for (const state of states) {
            const actor = state.actor
            if (
                !npcAiActorAvailable(actor) ||
                !canQueueReaction(state, actor, now, wallNow) ||
                actor.locationId !== target.locationId ||
                !canSeePoint(actor, impact, navigation) ||
                !canSeeCombatant(actor, attacker, navigation, now) ||
                !canSeeCombatant(actor, target, navigation, now)
            ) {
                continue
            }
            const task: NpcAiTask = {
                id: seen.id,
                requesterId: null,
                background: 'combat_reaction',
                deadline: now + reactionWindowMs,
                request:
                    'React to the witnessed combat hit with one short spoken line or silence. Return only speech or null, decision:null, taskAcceptance:none, companionOrder:null, memory:"" and done:true. Do not state exact damage or take any action.',
                steps: 0,
            }
            witnesses.set(task, {
                actor,
                locationId: actor.locationId,
                deathSequence: actor.deathSequence,
                impact,
            })
            state.task = task
            state.events = [seen]
            state.awaitingFreshRequest = false
        }
    }
}

function publicCombatHit(room: GameRoom, event: GameEventPayload) {
    if (!isPublicDamage(event)) {
        return undefined
    }
    const attacker = room.getCharacter(event.actorId ?? '')
    const target = room.getCharacter(event.targetId ?? '')
    if (
        attacker === undefined ||
        attacker.locationId !== target?.locationId ||
        (event.locationId ?? target.locationId) !== target.locationId ||
        attacker.trainingTarget !== undefined ||
        target.trainingTarget !== undefined
    ) {
        return undefined
    }
    return {
        attacker,
        target,
        impact: { ...(event.position ?? target.position) },
    }
}

export function npcCombatReactionContext(
    state: NpcAiActorState,
    actor: GameCharacter,
    observation: NpcAiObservation,
    identity: Pick<NpcAiContext, 'selfIdentity' | 'speechStyle'>
): NpcAiContext {
    const { tick, serverTime, locationId, locationName, self } = observation
    return structuredClone({
        actorId: actor.id,
        role: state.config.role,
        personality: actor.soul.personality,
        speechLanguage: 'ru',
        ...identity,
        task: state.task,
        events: state.events,
        memory: '',
        facts: [],
        observation: {
            tick,
            serverTime,
            locationId,
            locationName,
            self,
            targets: [],
            dialogue: null,
            dialogueCommands: [],
        },
    })
}

function isPublicDamage(event: GameEventPayload): boolean {
    const amount = event.amount ?? 0
    return (
        event.kind === 'damage' &&
        event.audienceIds === undefined &&
        Number.isFinite(amount) &&
        amount > 0
    )
}

function canQueueReaction(
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    wallNow: number
): boolean {
    return (
        (state.config.mode !== 'dialogue_only' ||
            state.config.role === 'necromancer') &&
        actor.soul.canSpeak &&
        state.task === null &&
        state.dialogue === undefined &&
        state.inbox.length === 0 &&
        state.controller === undefined &&
        state.ready === undefined &&
        state.finalizing === undefined &&
        state.nextAt <= now &&
        wallNow - (lastLaunch.get(actor) ?? -Infinity) >= reactionCooldownMs
    )
}

function combatant(actor: GameCharacter) {
    return { id: actor.id, name: actor.nickname }
}

function canSeeCombatant(
    actor: GameCharacter,
    subject: GameCharacter,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        canSeePoint(actor, subject.position, navigation) &&
        distance(actor.position, subject.position) <=
            visibilityRadius(actor, subject, PUBLIC_SPEECH_RADIUS, now)
    )
}

function canSeePoint(
    actor: GameCharacter,
    point: Vector2,
    navigation: NavigationService
): boolean {
    const buildings = navigation.grid.buildings ?? []
    return (
        distance(actor.position, point) <= PUBLIC_SPEECH_RADIUS &&
        navigation.hasLineOfSight(actor.position, point) &&
        visibleBuildingPoint(buildings, actor.position, point) &&
        visibleBuildingPoint(buildings, point, actor.position)
    )
}

export function npcCombatReactionStillAvailable(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    const task = state.task
    const actor = state.actor
    if (task?.background !== 'combat_reaction' || !npcAiActorAvailable(actor)) {
        return false
    }
    const witness = witnesses.get(task)
    return (
        witness !== undefined &&
        currentWitness(room, witness, actor) &&
        speechAvailable(actor) &&
        room.allowsAutonomousNpcAi() &&
        state.inbox.length === 0 &&
        now < (task.deadline ?? 0) &&
        canSeePoint(actor, witness.impact, room.navigationFor(actor))
    )
}

function currentWitness(
    room: GameRoom,
    witness: CombatWitness,
    actor: GameCharacter
): boolean {
    return (
        witness.actor === actor &&
        room.getCharacter(actor.id) === actor &&
        actor.locationId === witness.locationId &&
        actor.deathSequence === witness.deathSequence
    )
}

export function markNpcCombatReactionStarted(
    state: NpcAiActorState,
    wallNow: number
): void {
    if (
        state.task?.background === 'combat_reaction' &&
        state.dialogue === undefined &&
        state.actor !== undefined
    ) {
        lastLaunch.set(state.actor, wallNow)
    }
}

export function npcCombatReactionProblem(
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    if (
        reply.decision !== null ||
        reply.offerService != null ||
        reply.informationRequest != null ||
        reply.personMemoryUpdate != null ||
        reply.companionOrder != null ||
        reply.waitMode != null ||
        (reply.taskAcceptance ?? 'none') !== 'none'
    ) {
        return {
            code: 'command_unavailable',
            reason: {
                code: 'combat_reaction_speech_only',
                detail: 'A witnessed hit permits only optional ambient speech.',
            },
        }
    }
    return undefined
}

export function completeNpcCombatReaction(
    room: GameRoom,
    state: NpcAiActorState,
    reply: NpcAiReply,
    now: number
): boolean {
    if (state.task?.background !== 'combat_reaction') {
        return false
    }
    const actor = state.actor
    const text = reply.speech?.trim().slice(0, 160)
    if (
        actor !== undefined &&
        text !== undefined &&
        text.length > 0 &&
        npcCombatReactionStillAvailable(room, state, now)
    ) {
        room.publishEvents([
            { ...createSpeechEvent(actor, text), language: 'ru' },
        ])
    }
    return true
}

import type {
    CompanionClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import {
    type AgentDecisionResult,
    applyAgentDecision,
    type CompanionWorld,
    parseAgentDecision,
} from './agentDecisions'
import type { GameCharacter } from './character'
import {
    advanceCompanionIntent,
    type CompanionRuntime,
} from './companionMovement'
import {
    companionProfiles,
    consentReply,
    refusalFor,
    residentProfile,
} from './companionProfiles'
import { distance } from './math'
import { cancelMovementMode } from './movementActions'

export class CompanionService {
    private readonly states = new Map<string, CompanionRuntime>()
    private readonly leases = new Map<string, number>()

    public rememberMeeting(
        actor: GameCharacter,
        npc: GameCharacter | undefined
    ): void {
        if (
            !canRequest(actor, npc) ||
            !npc.soul.canSpeak ||
            npc.controllerKind === 'network_player'
        ) {
            return
        }
        this.stateFor(npc).metActors.add(actor.id)
    }

    public handle(
        actor: GameCharacter,
        message: CompanionClientMessage,
        characters: Iterable<GameCharacter>,
        now: number
    ): GameEventPayload[] {
        const npc = [...characters].find(
            (candidate) => candidate.id === message.targetId
        )
        if (!canRequest(actor, npc)) {
            return notice(
                actor,
                'Подойди к живому собеседнику ближе: не дальше 64 шагов.'
            )
        }
        if (!npc.soul.canSpeak) {
            return notice(
                actor,
                'Это существо не владеет речью. Вид существа и способность говорить — разные вещи.'
            )
        }
        if (npc.controllerKind === 'network_player') {
            return notice(actor, 'Другой человек решает за своего героя сам.')
        }
        const state = this.stateFor(npc)
        if (message.request === 'talk') {
            const known = state.metActors.has(actor.id)
            state.metActors.add(actor.id)
            const text = known
                ? `Помню тебя, ${actor.nickname}. ${state.leaderId === actor.id ? 'Я рядом по собственной воле.' : state.profile.greeting}`
                : state.profile.greeting
            return this.reply(npc, actor, state, text)
        }
        return this.handleRequest(npc, actor, state, message, now)
    }

    private handleRequest(
        npc: GameCharacter,
        actor: GameCharacter,
        state: CompanionRuntime,
        message: CompanionClientMessage,
        now: number
    ): GameEventPayload[] {
        if (state.leaderId !== null && state.leaderId !== actor.id) {
            return this.reply(
                npc,
                actor,
                state,
                'Я уже дала слово другому спутнику. Решать за него тебе не позволю.'
            )
        }
        if (message.request === 'dismiss') {
            if (state.leaderId !== actor.id) {
                return this.reply(
                    npc,
                    actor,
                    state,
                    'Наши дороги пока не были связаны.'
                )
            }
            release(npc, state)
            return this.reply(
                npc,
                actor,
                state,
                'Хорошо. Дальше каждый выбирает свою дорогу. Береги себя.'
            )
        }
        const refusal = refusalFor(state.profile, message.request)
        if (refusal !== undefined) {
            return this.reply(npc, actor, state, refusal)
        }
        if (state.profile.needsIntroduction && !state.metActors.has(actor.id)) {
            return this.reply(
                npc,
                actor,
                state,
                'Я не пойду с незнакомцем. Сначала поговорим, а потом решу сама.'
            )
        }
        if (message.request === 'talk') {
            return []
        }
        state.lastPlanAt = now - 300
        state.leaderId = actor.id
        state.order =
            message.request === 'guard' || state.profile.stationary
                ? 'guard'
                : message.request
        state.anchor = { ...npc.position }
        state.anchorLocation = npc.locationId
        npc.clearPath()
        const text = consentReply(state.profile, state.order)
        return this.reply(npc, actor, state, text)
    }

    public update(
        character: GameCharacter,
        world: CompanionWorld,
        now: number
    ): GameEventPayload[] {
        if (this.hasActiveLease(character, now, world)) {
            return []
        }
        const state = this.stateFor(character)
        if (
            !character.alive ||
            character.tags.has('offline') ||
            character.tags.has('state.retired')
        ) {
            release(character, state)
            return []
        }
        const leader =
            state.leaderId === null
                ? undefined
                : world.getCharacter(state.leaderId)
        if (state.leaderId !== null && !availableLeader(leader)) {
            release(character, state)
            return this.reply(
                character,
                undefined,
                state,
                'Наш путь прервался. Я не пойду за безмолвным следом и буду решать сама.'
            )
        }
        advanceCompanionIntent(character, leader, state, world, now)
        sync(character, state)
        return []
    }

    public decide(
        character: GameCharacter,
        decision: unknown,
        world: CompanionWorld,
        now: number
    ): AgentDecisionResult {
        const result = applyAgentDecision(character, decision, world, now)
        if (!result.accepted) {
            return result
        }
        const parsed = parseAgentDecision(decision)
        if (parsed?.type === 'speak') {
            const state = this.stateFor(character)
            state.lastReply = parsed.text
            sync(character, state)
        }
        if (parsed?.type === 'wait') {
            this.leases.delete(character.id)
            character.soul.controlSource = 'script'
        } else {
            this.leases.set(character.id, now + 5_000)
            character.soul.controlSource = 'model'
        }
        return result
    }

    public hasActiveLease(
        character: GameCharacter,
        now: number,
        world?: CompanionWorld
    ): boolean {
        const until = this.leases.get(character.id)
        if (until === undefined) {
            return false
        }
        if (until > now && character.alive && !character.tags.has('offline')) {
            return true
        }
        this.leases.delete(character.id)
        world?.requestControl?.(character, { type: 'cancel_control' }, now)
        cancelMovementMode(character)
        character.soul.controlSource = 'script'
        character.setMoveInput({ x: 0, y: 0 })
        character.clearPath()
        return false
    }

    private reply(
        npc: GameCharacter,
        actor: GameCharacter | undefined,
        state: CompanionRuntime,
        text: string
    ): GameEventPayload[] {
        state.lastReply = text
        sync(npc, state)
        return npc.soul.canSpeak
            ? [
                  {
                      actorId: npc.id,
                      kind: 'chat',
                      ...(actor === undefined ? {} : { targetId: actor.id }),
                      text,
                  },
              ]
            : []
    }

    private stateFor(character: GameCharacter): CompanionRuntime {
        let state = this.states.get(character.id)
        if (state === undefined) {
            state = {
                anchor: { ...character.position },
                anchorLocation: character.locationId,
                lastPlanAt: 0,
                lastReply: null,
                leaderId: null,
                metActors: new Set<string>(),
                order: 'idle',
                profile: companionProfiles[character.id] ?? residentProfile,
            }
            this.states.set(character.id, state)
        }
        return state
    }
}

function canRequest(
    actor: GameCharacter,
    npc: GameCharacter | undefined
): npc is GameCharacter {
    return (
        npc !== undefined &&
        actor.id !== npc.id &&
        actor.alive &&
        npc.alive &&
        !actor.tags.has('offline') &&
        !npc.tags.has('offline') &&
        !npc.tags.has('state.retired') &&
        actor.faction === npc.faction &&
        actor.locationId === npc.locationId &&
        distance(actor.position, npc.position) <= 64
    )
}

function availableLeader(
    leader: GameCharacter | undefined
): leader is GameCharacter {
    return (
        leader !== undefined &&
        leader.alive &&
        !leader.tags.has('offline') &&
        !leader.tags.has('state.retired')
    )
}

function release(character: GameCharacter, state: CompanionRuntime): void {
    state.leaderId = null
    state.order = 'idle'
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
    sync(character, state)
}

function sync(character: GameCharacter, state: CompanionRuntime): void {
    character.soul.companion = {
        canFight: state.profile.canFight,
        lastReply: state.lastReply,
        leaderId: state.leaderId,
        order: state.order,
    }
}

function notice(actor: GameCharacter, text: string): GameEventPayload[] {
    return [{ actorId: actor.id, kind: 'notice', text }]
}

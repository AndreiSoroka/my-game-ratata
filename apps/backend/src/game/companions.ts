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
    type AssistanceContext,
    CompanionAssistance,
} from './companionAssistance'
export type { AssistanceContext, AssistanceResult } from './companionAssistance'
import { setCharacterControlSource } from './characterSoul'
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
import {
    availableLeader,
    canRequest,
    notice,
    release,
    replyToCompanion,
    setCompanionReplyRecipient,
    sync,
} from './companionState'
import { cancelMovementMode } from './movementActions'
import { prepareConstellationLayout } from './personalConstellationSky'
import { isAutomationCommand } from './scenarioCommands'

export class CompanionService {
    private readonly states = new Map<string, CompanionRuntime>()
    private readonly leases = new Map<
        string,
        { until: number; blocksScenario: boolean }
    >()

    private readonly assistance = new CompanionAssistance((npc) =>
        this.stateFor(npc)
    )
    public readonly canAssist = this.assistance.canAssist
    public readonly claimAssistance = this.assistance.claimAssistance
    public readonly releaseAssistance = this.assistance.releaseAssistance
    public readonly hasConsent = this.assistance.hasConsent
    public readonly capabilities = this.assistance.capabilities

    public dialogueText(actor: GameCharacter, npc: GameCharacter): string {
        const state = this.stateFor(npc)
        return state.metActors.has(actor.id)
            ? `Помню тебя, ${actor.nickname}. ${state.leaderId === actor.id ? 'Я рядом по собственной воле.' : state.profile.greeting}`
            : state.profile.greeting
    }

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
        now: number,
        assistance?: AssistanceContext
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
            const text = this.dialogueText(actor, npc)
            state.metActors.add(actor.id)
            return this.reply(npc, actor, state, text)
        }
        return this.handleRequest(npc, actor, state, message, now, assistance)
    }

    private handleRequest(
        npc: GameCharacter,
        actor: GameCharacter,
        state: CompanionRuntime,
        message: CompanionClientMessage,
        now: number,
        assistance?: AssistanceContext
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
        const consentError = this.assistance.requestError(
            actor,
            npc,
            assistance,
            now
        )
        if (consentError !== null) {
            return this.reply(npc, actor, state, consentError)
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
        if (this.blocksScenario(character, now, world)) {
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
            setCompanionReplyRecipient(character, undefined)
            sync(character, state)
        }
        if (parsed?.type === 'wait') {
            this.leases.delete(character.id)
            setCharacterControlSource(character, 'script')
        } else {
            prepareConstellationLayout(character)
            this.leases.set(character.id, {
                until: now + 5_000,
                blocksScenario:
                    parsed?.type !== 'speak' &&
                    !isAutomationCommand(parsed?.type),
            })
            setCharacterControlSource(character, 'model')
        }
        return result
    }

    public hasActiveLease(
        character: GameCharacter,
        now: number,
        world?: CompanionWorld
    ): boolean {
        const lease = this.leases.get(character.id)
        if (lease === undefined) {
            return false
        }
        if (
            lease.until > now &&
            character.alive &&
            !character.tags.has('offline')
        ) {
            return true
        }
        this.leases.delete(character.id)
        setCharacterControlSource(character, 'script')
        if (lease.blocksScenario) {
            world?.requestControl?.(character, { type: 'cancel_control' }, now)
            cancelMovementMode(character)
            character.setMoveInput({ x: 0, y: 0 })
            character.clearPath()
        }
        return false
    }

    public blocksScenario(
        character: GameCharacter,
        now: number,
        world?: CompanionWorld
    ): boolean {
        return (
            this.hasActiveLease(character, now, world) &&
            this.leases.get(character.id)?.blocksScenario === true
        )
    }

    private readonly reply = replyToCompanion

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

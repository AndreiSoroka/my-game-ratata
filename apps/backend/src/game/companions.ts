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
import {
    applyModelCompanionCommand,
    checkCompanionCommand,
    type CompanionCommandCheck,
    createCompanionRuntime,
    scriptedCompanionDenial,
    scriptedCompanionGreeting,
} from './companionCommand'
import { applyCompanionOrder } from './companionOrders'
export type { AssistanceContext, AssistanceResult } from './companionAssistance'
import {
    advanceCompanionIntent,
    type CompanionRuntime,
} from './companionMovement'
import { consentReply } from './companionProfiles'
import {
    availableLeader,
    canRequest,
    notice,
    release,
    replyToCompanion,
    setCompanionReplyRecipient,
    sync,
} from './companionState'
import { consumeCompanionWait } from './companionWait'
import { ModelControlLeases } from './modelControlLeases'

export class CompanionService {
    private readonly states = new Map<string, CompanionRuntime>()
    private readonly leases = new ModelControlLeases()
    public readonly claimModelControl = this.leases.claimModelControl.bind(
        this.leases
    )
    public readonly renewModelControl = this.leases.renewModelControl.bind(
        this.leases
    )
    public readonly releaseModelControl = this.leases.releaseModelControl.bind(
        this.leases
    )
    public readonly isModelControlOwner = this.leases.isModelControlOwner.bind(
        this.leases
    )
    public readonly hasActiveLease = this.leases.hasActiveLease.bind(
        this.leases
    )
    public readonly blocksScenario = this.leases.blocksScenario.bind(
        this.leases
    )
    public readonly setModelControlExclusive = this.leases.setExclusive.bind(
        this.leases
    )
    public readonly controlRevision = (character: GameCharacter): number =>
        this.stateFor(character).controlRevision ?? 0
    public consumeWaitForAcceptedTask(
        npc: GameCharacter,
        owner: GameCharacter,
        context: AssistanceContext,
        now: number
    ): void {
        consumeCompanionWait(
            npc,
            owner,
            this.stateFor(npc),
            () => this.assistance.canAssist(owner, npc, context, now).accepted
        )
    }
    public setWaitAnchor(
        character: GameCharacter,
        ownerId: string,
        anchor: {
            locationId: string
            position: import('@my-game-ratata/contracts').Vector2
        }
    ): void {
        const state = this.stateFor(character)
        if (
            state.order === 'wait' &&
            state.leaderId === ownerId &&
            anchor.locationId === character.locationId
        ) {
            state.anchor = { ...anchor.position }
            state.anchorLocation = anchor.locationId
        }
    }

    private readonly assistance = new CompanionAssistance((npc) =>
        this.stateFor(npc)
    )
    public readonly canAssist = this.assistance.canAssist
    public readonly claimAssistance = this.assistance.claimAssistance
    public readonly releaseAssistance = this.assistance.releaseAssistance
    public readonly hasConsent = this.assistance.hasConsent
    public readonly capabilities = this.assistance.capabilities

    public checkOrder(
        actor: GameCharacter,
        npc: GameCharacter | undefined,
        message: CompanionClientMessage,
        now: number,
        context?: AssistanceContext
    ): CompanionCommandCheck {
        return checkCompanionCommand(
            actor,
            npc,
            npc === undefined ? undefined : this.stateFor(npc),
            message,
            this.assistance,
            now,
            context
        )
    }

    /** AI execution does not generate a scripted answer or overwrite lastReply. */
    public applyModelOrder(
        actor: GameCharacter,
        npc: GameCharacter,
        message: CompanionClientMessage,
        now: number,
        context: AssistanceContext
    ): CompanionCommandCheck {
        return applyModelCompanionCommand(
            actor,
            npc,
            this.stateFor(npc),
            message,
            this.assistance,
            now,
            context
        )
    }

    public dialogueText(actor: GameCharacter, npc: GameCharacter): string {
        return scriptedCompanionGreeting(actor, this.stateFor(npc))
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
        const result = this.checkOrder(actor, npc, message, now, assistance)
        if (!result.accepted) {
            const text = scriptedCompanionDenial(
                state.profile,
                message.request,
                result.reason
            )
            return this.reply(npc, actor, state, text)
        }
        if (message.request === 'dismiss') {
            release(npc, state)
            return this.reply(
                npc,
                actor,
                state,
                'Хорошо. Дальше каждый выбирает свою дорогу. Береги себя.'
            )
        }
        if (message.request === 'talk') {
            return []
        }
        applyCompanionOrder(npc, actor, state, message, now)
        return this.reply(
            npc,
            actor,
            state,
            consentReply(state.profile, state.order)
        )
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
        now: number,
        ownerToken?: string
    ): AgentDecisionResult {
        if (!this.leases.canDecide(character, ownerToken, world, now)) {
            return {
                accepted: false,
                error: 'Character control belongs to another model session',
                events: [],
            }
        }
        const result = applyAgentDecision(character, decision, world, now)
        if (!result.accepted) {
            return result
        }
        const parsed = parseAgentDecision(decision)
        if (parsed?.type === 'speak') {
            const state = this.stateFor(character)
            state.lastReply = parsed.text
            setCompanionReplyRecipient(character, parsed.targetId)
            sync(character, state)
        }
        if (parsed !== undefined) {
            this.leases.recordDecision(character, parsed, now, ownerToken)
        }
        return result
    }

    private readonly reply = replyToCompanion

    private stateFor(character: GameCharacter): CompanionRuntime {
        let state = this.states.get(character.id)
        if (state === undefined) {
            state = createCompanionRuntime(character)
            this.states.set(character.id, state)
        }
        return state
    }
}

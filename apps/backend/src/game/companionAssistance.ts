import { evaluateAssistancePolicy } from './assistancePolicy'
import type { GameCharacter } from './character'
import type { CompanionRuntime } from './companionMovement'
import { canRequest, release, sync } from './companionState'
import { canPerformSkillAction } from './skillProgression'

export interface AssistanceContext {
    modelConsent?: boolean
    /** A server-validated current conversation, never supplied by a client. */
    conversation?: boolean
    questCompleted(actorId: string, questId: string): boolean
    hasLineOfSight(actor: GameCharacter, npc: GameCharacter): boolean
}

export interface AssistanceResult {
    accepted: boolean
    error: string | null
}

export class CompanionAssistance {
    public constructor(
        private readonly stateFor: (npc: GameCharacter) => CompanionRuntime
    ) {}

    public readonly canAssist = (
        actor: GameCharacter,
        npc: GameCharacter,
        context: AssistanceContext,
        now: number
    ): AssistanceResult => {
        if (!assistanceAvailable(actor, npc, context, now)) {
            return {
                accepted: false,
                error: 'Подойди к свободному живому помощнику в пределах 64 шагов.',
            }
        }
        if (
            actor.soul.kind !== 'spark' ||
            (actor.controllerKind === 'network_player' && !actor.connected)
        ) {
            return {
                accepted: false,
                error: 'Сценарий может поручить только персонаж с действующей Искрой.',
            }
        }
        if (
            npc.controllerKind === 'network_player' ||
            !acceptsAssistanceSource(npc, context) ||
            !npc.soul.canSpeak
        ) {
            return {
                accepted: false,
                error: 'Этот персонаж сейчас не принимает поручений.',
            }
        }
        const state = this.stateFor(npc)
        if (state.leaderId !== null && state.leaderId !== actor.id) {
            return {
                accepted: false,
                error: 'Помощник уже дал согласие другому персонажу.',
            }
        }
        if (
            !evaluateAssistancePolicy(state.profile.assistancePolicy, {
                met:
                    state.metActors.has(actor.id) ||
                    context.conversation === true,
                questCompleted: (questId) =>
                    context.questCompleted(actor.id, questId),
            })
        ) {
            return {
                accepted: false,
                error: assistanceRefusal(state.profile.assistancePolicy.kind),
            }
        }
        return { accepted: true, error: null }
    }

    public readonly claimAssistance = (
        actor: GameCharacter,
        npc: GameCharacter,
        context: AssistanceContext,
        now: number
    ): AssistanceResult => {
        const result = this.canAssist(actor, npc, context, now)
        if (!result.accepted) {
            return result
        }
        const state = this.stateFor(npc)
        state.leaderId = actor.id
        state.order = 'guard'
        state.anchor = { ...npc.position }
        state.anchorLocation = npc.locationId
        sync(npc, state)
        return result
    }

    public readonly releaseAssistance = (
        actorId: string,
        npc: GameCharacter
    ): boolean => {
        const state = this.stateFor(npc)
        if (state.leaderId !== actorId) {
            return false
        }
        release(npc, state)
        return true
    }

    public readonly hasConsent = (
        actorId: string,
        npc: GameCharacter
    ): boolean => {
        return this.stateFor(npc).leaderId === actorId
    }

    public readonly capabilities = (
        npc: GameCharacter
    ): {
        canFight: boolean
        canFollow: boolean
    } => {
        const profile = this.stateFor(npc).profile
        return { canFight: profile.canFight, canFollow: profile.canFollow }
    }

    public requestError(
        actor: GameCharacter,
        npc: GameCharacter,
        context: AssistanceContext | undefined,
        now: number
    ): string | null {
        if (!this.stateFor(npc).profile.canFollow) {
            return null
        }
        return this.canAssist(
            actor,
            npc,
            context ?? {
                questCompleted: () => false,
                hasLineOfSight: () => true,
            },
            now
        ).error
    }
}

function assistanceRefusal(kind: string): string {
    if (kind === 'met') {
        return 'Сначала познакомимся: поговори со мной.'
    }
    if (kind === 'quest_completed') {
        return 'Сначала помоги Мире собрать сердца для колокола памяти.'
    }
    return 'Я не согласен выполнять это поручение.'
}

function assistanceAvailable(
    actor: GameCharacter,
    npc: GameCharacter,
    context: AssistanceContext,
    now: number
): boolean {
    return (
        canRequest(actor, npc) &&
        context.hasLineOfSight(actor, npc) &&
        canPerformSkillAction(actor, now) &&
        canPerformSkillAction(npc, now)
    )
}

function acceptsAssistanceSource(
    npc: GameCharacter,
    context: AssistanceContext
): boolean {
    return (
        npc.soul.controlSource === 'script' ||
        (context.modelConsent === true && npc.soul.controlSource === 'model')
    )
}

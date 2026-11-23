import type { GameCharacter } from './character'
import type {
    AssistanceContext,
    CompanionAssistance,
} from './companionAssistance'
import {
    checkCompanionCommand,
    type CompanionCommandCheck,
} from './companionCommand'
import type { CompanionRuntime } from './companionMovement'

/** A companion's unsolicited invitation never assigns control to the player. */
export class CompanionInitiative {
    public constructor(
        private readonly stateFor: (npc: GameCharacter) => CompanionRuntime,
        private readonly assistance: CompanionAssistance
    ) {}

    public readonly checkSelfFollowing = (
        npc: GameCharacter,
        leader: GameCharacter,
        now: number,
        context: AssistanceContext,
        mode: 'propose' | 'start'
    ): CompanionCommandCheck => {
        const state = this.stateFor(npc)
        if (
            state.profile.selfInitiatedFollowing !== true ||
            state.leaderId !== null ||
            state.refusedFollowing?.has(leader.id) === true ||
            (state.followProposals?.get(leader.id) ?? 0) > now ||
            leader.controllerKind !== 'network_player'
        ) {
            return {
                accepted: false,
                reason: {
                    code: 'cannot_follow',
                    detail: 'Сейчас я не могу сама предложить этому путнику компанию.',
                },
            }
        }
        if (mode === 'start' && !state.metActors.has(leader.id)) {
            return {
                accepted: false,
                reason: {
                    code: 'introduction_required',
                    detail: 'Сначала нужно познакомиться с путником.',
                },
            }
        }
        return checkCompanionCommand(
            leader,
            npc,
            state,
            { type: 'companion_request', targetId: npc.id, request: 'follow' },
            this.assistance,
            now,
            { ...context, conversation: mode === 'propose' }
        )
    }

    public readonly noteFollowProposal = (
        npc: GameCharacter,
        leaderId: string,
        now: number
    ): void => {
        const state = this.stateFor(npc)
        const proposals = (state.followProposals ??= new Map())
        proposals.set(leaderId, now + 60_000)
    }

    public readonly hasFollowProposal = (
        npc: GameCharacter,
        leaderId: string,
        now: number
    ): boolean => {
        return (this.stateFor(npc).followProposals?.get(leaderId) ?? 0) > now
    }

    public readonly recordFollowRefusal = (
        npc: GameCharacter,
        leaderId: string
    ): void => {
        const state = this.stateFor(npc)
        if (state.profile.selfInitiatedFollowing === true) {
            const refusals = (state.refusedFollowing ??= new Set())
            refusals.add(leaderId)
            state.followProposals?.delete(leaderId)
        }
    }
}

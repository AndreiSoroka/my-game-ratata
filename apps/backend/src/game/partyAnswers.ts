import type { PartyInvitationSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GuildService } from './guild'
import { resetMartyrStreak } from './martyr'
import type { NoticeStore } from './notices'
import {
    cancelPartyInvitations,
    nearbyPlayers,
    type PartyRecord,
} from './partyRules'

export function answerPartyInvitation(
    actor: GameCharacter,
    invitationId: string,
    accept: boolean,
    now: number,
    context: {
        invitations: Map<string, PartyInvitationSnapshot>
        characters: ReadonlyMap<string, GameCharacter>
        parties: ReadonlyMap<string, PartyRecord>
        membership: Map<string, string>
        guild: GuildService
        notices: NoticeStore
    }
): string {
    const invitation = context.invitations.get(invitationId)
    if (invitation?.toId !== actor.id || invitation.expiresAt <= now) {
        return 'Приглашение недоступно или истекло.'
    }
    context.invitations.delete(invitationId)
    if (!accept) {
        return 'Ты отказался от приглашения.'
    }
    const leader = context.characters.get(invitation.fromId)
    const party = context.parties.get(
        context.membership.get(invitation.fromId) ?? ''
    )
    if (
        !nearbyPlayers(actor, leader) ||
        party?.leaderId !== invitation.fromId ||
        party.members.size >= 4 ||
        context.membership.has(actor.id)
    ) {
        return 'Состав группы изменился. Попроси новое приглашение.'
    }
    if (context.guild.hasActiveJob(`solo:${actor.id}`)) {
        return 'Сначала заверши свой личный договор, чтобы не потерять его.'
    }
    resetMartyrStreak(actor)
    party.members.add(actor.id)
    context.guild.addLateMember(party.id, actor)
    context.membership.set(actor.id, party.id)
    cancelPartyInvitations(context.invitations, actor.id)
    context.notices.set(leader.id, `${actor.nickname} присоединился к группе.`)
    return 'Ты вступил в группу по собственной воле.'
}

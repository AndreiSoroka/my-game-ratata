import type { PartyInvitationSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import type { GuildService } from './guild'
import { interactionRangeText } from './interactionRangeText'
import type { NavigationService } from './navigation'
import type { NoticeStore } from './notices'
import {
    nearbyPlayers,
    PARTY_INVITATION_RANGE,
    type PartyRecord,
    pendingPartyInvitation,
} from './partyRules'

interface PartyInviteContext {
    characters: ReadonlyMap<string, GameCharacter>
    membership: Map<string, string>
    parties: Map<string, PartyRecord>
    invitations: Map<string, PartyInvitationSnapshot>
    notices: NoticeStore
    guild: GuildService
    newPartyId: () => string
    newInvitationId: () => string
}

export function inviteToParty(
    actor: GameCharacter,
    targetId: string,
    now: number,
    context: PartyInviteContext,
    navigation?: NavigationService
): string {
    const {
        characters,
        membership,
        parties,
        invitations,
        notices,
        guild,
        newPartyId,
    } = context
    const target = characters.get(targetId)
    if (
        !nearbyPlayers(actor, target) ||
        !canObserveRoomCharacter(actor, target, navigation, now)
    ) {
        return `Пригласи другого живого игрока ${interactionRangeText(PARTY_INVITATION_RANGE, navigation?.grid.tileWidth)} в своей локации.`
    }
    const pending = pendingPartyInvitation(
        invitations.values(),
        actor.id,
        target.id
    )
    if (pending !== undefined) {
        return pending.toId === actor.id
            ? 'Сначала ответь на полученное приглашение.'
            : 'Приглашение уже отправлено.'
    }
    if (membership.has(target.id)) {
        return 'Этот искатель уже состоит в группе.'
    }
    let party = parties.get(membership.get(actor.id) ?? '')
    if (party === undefined) {
        party = {
            id: newPartyId(),
            leaderId: actor.id,
            members: new Set([actor.id]),
        }
        parties.set(party.id, party)
        membership.set(actor.id, party.id)
        guild.moveJob(`solo:${actor.id}`, party.id)
    }
    if (party.leaderId !== actor.id || party.members.size >= 4) {
        return 'Приглашает только лидер; в группе не больше четырёх участников.'
    }
    const invitation: PartyInvitationSnapshot = {
        id: context.newInvitationId(),
        fromId: actor.id,
        fromName: actor.nickname,
        toId: target.id,
        toName: target.nickname,
        expiresAt: now + 30_000,
    }
    invitations.set(invitation.id, invitation)
    notices.set(
        target.id,
        `${actor.nickname} приглашает тебя в группу. Решение за тобой.`
    )
    return 'Приглашение отправлено на 30 секунд.'
}

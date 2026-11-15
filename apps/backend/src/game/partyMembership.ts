import type { PartyInvitationSnapshot } from '@my-game-ratata/contracts'

import type { GuildService } from './guild'
import { cancelPartyInvitations, type PartyRecord } from './partyRules'

export function resolvePartyGroup(
    playerId: string,
    parties: ReadonlyMap<string, PartyRecord>,
    membership: ReadonlyMap<string, string>
): { key: string; members: Set<string> } {
    const party = parties.get(membership.get(playerId) ?? '')
    return party === undefined
        ? { key: `solo:${playerId}`, members: new Set([playerId]) }
        : { key: party.id, members: party.members }
}

export function removePartyMember(
    playerId: string,
    parties: Map<string, PartyRecord>,
    membership: Map<string, string>,
    guild: GuildService,
    invitations: Map<string, PartyInvitationSnapshot>
): void {
    const party = parties.get(membership.get(playerId) ?? '')
    if (party !== undefined) {
        party.members.delete(playerId)
        guild.removeMember(party.id, playerId)
        guild.refreshGroup(party.id, party.members)
        if (party.members.size === 0) {
            parties.delete(party.id)
        } else if (party.leaderId === playerId) {
            party.leaderId = [...party.members][0] ?? ''
        }
    }
    membership.delete(playerId)
    cancelPartyInvitations(invitations, playerId)
}

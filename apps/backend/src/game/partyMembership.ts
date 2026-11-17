import type { PartyInvitationSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ContractSlots } from './contractSlots'
import type { GuildService } from './guild'
import { cancelPartyInvitations, type PartyRecord } from './partyRules'
import { shouldRemoveMember } from './partyRules'

export function rewardPartyMembers(
    members: Set<string>,
    characters: ReadonlyMap<string, GameCharacter>
): string[] {
    return [...members].filter((id) => !shouldRemoveMember(characters.get(id)))
}

export function samePartyMembers(
    firstId: string,
    secondId: string,
    membership: ReadonlyMap<string, string>
): boolean {
    const partyId = membership.get(firstId)
    return partyId !== undefined && partyId === membership.get(secondId)
}

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

export function partyContractGroup(
    actorId: string,
    parties: ReadonlyMap<string, PartyRecord>,
    membership: ReadonlyMap<string, string>,
    guild: GuildService
) {
    const group = resolvePartyGroup(actorId, parties, membership)
    return {
        ...group,
        leaderId: parties.get(group.key)?.leaderId ?? actorId,
        occupied: guild.hasActiveJob(group.key),
    }
}

export function partyContractRoster(
    instanceId: string,
    parties: ReadonlyMap<string, PartyRecord>,
    slots: ContractSlots
) {
    const key = slots.keyFor(instanceId)
    const party = parties.get(key ?? '')
    const owner = key?.startsWith('solo:') === true ? key.slice(5) : undefined
    return party === undefined
        ? {
              members: new Set(owner === undefined ? [] : [owner]),
              leaderId: owner,
          }
        : { members: party.members, leaderId: party.leaderId }
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

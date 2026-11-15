import type {
    PartyInvitationSnapshot,
    PartySnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { type GuildService } from './guild'
import { distance } from './math'
import type { NoticeStore } from './notices'

export interface PartyRecord {
    id: string
    leaderId: string
    members: Set<string>
}

export function available(character: GameCharacter | undefined): boolean {
    return (
        character?.controllerKind === 'network_player' &&
        character.connected &&
        character.alive &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired')
    )
}

export function nearbyPlayers(
    actor: GameCharacter,
    other: GameCharacter | undefined
): other is GameCharacter {
    return (
        other !== undefined &&
        available(other) &&
        other.id !== actor.id &&
        other.locationId === actor.locationId &&
        distance(actor.position, other.position) <= 240
    )
}

export function guildContact(
    actor: GameCharacter,
    npc: GameCharacter
): boolean {
    return (
        ['npc_friendly_girl_1', 'npc_merchant_1'].includes(npc.id) &&
        npc.controllerKind !== 'network_player' &&
        npc.alive &&
        npc.faction === actor.faction &&
        npc.locationId === actor.locationId &&
        distance(actor.position, npc.position) <= 64
    )
}

export function shouldRemoveMember(
    character: GameCharacter | undefined
): boolean {
    return (
        character === undefined ||
        !character.connected ||
        character.tags.has('offline') ||
        character.tags.has('state.retired')
    )
}

export function staleInvitation(
    invitation: PartyInvitationSnapshot,
    characters: Map<string, GameCharacter>,
    now: number
): boolean {
    return (
        invitation.expiresAt <= now ||
        !available(characters.get(invitation.fromId)) ||
        !available(characters.get(invitation.toId))
    )
}

interface PartyView {
    parties: Map<string, PartyRecord>
    membership: Map<string, string>
    invitations: Map<string, PartyInvitationSnapshot>
    notices: NoticeStore
    characters: Map<string, GameCharacter>
    guild: GuildService
    contact: GameCharacter | undefined
}

export function createPartySnapshot(
    playerId: string,
    view: PartyView
): PartySnapshot {
    const party = view.parties.get(view.membership.get(playerId) ?? '')
    const members = party?.members ?? new Set([playerId])
    return structuredClone({
        activeJob: view.guild.snapshot(party?.id ?? `solo:${playerId}`),
        invitations: [...view.invitations.values()].filter(
            (invitation) =>
                invitation.fromId === playerId || invitation.toId === playerId
        ),
        jobs: view.guild.definitions(),
        guildContact:
            view.contact === undefined
                ? null
                : { npcId: view.contact.id, nickname: view.contact.nickname },
        leaderId: party?.leaderId ?? null,
        members: [...members].flatMap((id) => {
            const character = view.characters.get(id)
            return character === undefined
                ? []
                : [
                      {
                          id,
                          nickname: character.nickname,
                          alive: character.alive,
                          hpPercent: Math.floor(
                              Math.max(
                                  0,
                                  Math.min(
                                      1,
                                      character.hp /
                                          Math.max(1, character.maxHp)
                                  )
                              ) * 100
                          ),
                          online:
                              character.connected &&
                              !character.tags.has('offline'),
                          locationId: character.locationId,
                      },
                  ]
        }),
        notice: view.notices.get(playerId) ?? null,
        noticeId: view.notices.idFor(playerId),
        partyId: party?.id ?? null,
    })
}

export function pendingPartyInvitation(
    invitations: Iterable<PartyInvitationSnapshot>,
    actorId: string,
    targetId: string
): PartyInvitationSnapshot | undefined {
    return [...invitations].find(
        (invitation) =>
            (invitation.fromId === actorId && invitation.toId === targetId) ||
            (invitation.fromId === targetId && invitation.toId === actorId)
    )
}
export function cancelPartyInvitations(
    invitations: Map<string, PartyInvitationSnapshot>,
    playerId: string
): void {
    for (const [id, invitation] of invitations) {
        if (invitation.fromId === playerId || invitation.toId === playerId) {
            invitations.delete(id)
        }
    }
}

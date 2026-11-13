import type { CharacterSnapshot, PartySnapshot } from '@my-game-ratata/contracts'

import type { InteractionAction } from './nearbyInteractionActions'

function validTarget(player: CharacterSnapshot, target: CharacterSnapshot): boolean {
    return (
        target.id !== player.id &&
        target.alive &&
        !target.tags.includes('offline') &&
        target.controllerKind === 'network_player'
    )
}
function cannotInvite(player: CharacterSnapshot, party?: PartySnapshot): boolean {
    if (!party) return false
    return Boolean(party.leaderId && party.leaderId !== player.id) || party.members.length >= 4
}
export function invitationActions(
    player: CharacterSnapshot,
    target: CharacterSnapshot,
    party?: PartySnapshot
): InteractionAction[] {
    if (!validTarget(player, target)) return []
    if (party?.members.some((member) => member.id === target.id)) return []
    const incoming = party?.invitations.find(
        (invite) => invite.fromId === target.id && invite.toId === player.id
    )
    if (incoming)
        return [
            {
                id: `accept:${incoming.id}`,
                label: 'Принять приглашение',
                command: { type: 'party_answer', invitationId: incoming.id, accept: true },
            },
            {
                id: `decline:${incoming.id}`,
                label: 'Отказаться',
                command: { type: 'party_answer', invitationId: incoming.id, accept: false },
            },
        ]
    const sent = party?.invitations.some(
        (invite) => invite.fromId === player.id && invite.toId === target.id
    )
    const unavailable = cannotInvite(player, party)
    return [
        {
            id: `party:${target.id}`,
            label: sent ? 'Приглашение отправлено' : `Пригласить в отряд: ${target.nickname}`,
            disabled: sent || unavailable,
            command: { type: 'party_invite', targetId: target.id },
        },
    ]
}

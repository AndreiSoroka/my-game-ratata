import type { PartyClientMessage } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { PartyService } from '../src/game/parties'

function fixture() {
    const party = new PartyService()
    const players = ['leader', 'friend', 'other', 'fourth'].map(
        (id) =>
            new GameCharacter({
                id,
                nickname: id,
                archetype: 'human',
                controllerKind: 'network_player',
                spawnPosition: { x: 100, y: 100 },
            })
    )
    const [leader, friend, other, fourth] = players as [
        GameCharacter,
        GameCharacter,
        GameCharacter,
        GameCharacter,
    ]
    const command = (
        actor: GameCharacter,
        message: PartyClientMessage,
        now = 1000
    ) => party.handle(actor, message, players, now)
    const invite = (from: GameCharacter, to: GameCharacter, now = 1000) => {
        command(from, { type: 'party_invite', targetId: to.id }, now)
        const receipt = party
            .snapshot(to.id)
            .invitations.find((entry) => entry.fromId === from.id)
        if (receipt === undefined) {
            throw new Error('Missing invitation')
        }
        return receipt
    }
    const join = (from: GameCharacter, to: GameCharacter) => {
        const receipt = invite(from, to)
        command(to, {
            type: 'party_answer',
            invitationId: receipt.id,
            accept: true,
        })
    }
    return {
        party,
        players,
        leader,
        friend,
        other,
        fourth,
        command,
        invite,
        join,
    }
}

it('blocks reciprocal and repeated invitations without creating a second party or replacing the pending receipt', () => {
    const { party, leader, friend, command, invite } = fixture()
    const invitation = invite(leader, friend)
    command(friend, { type: 'party_invite', targetId: leader.id })
    expect(party.snapshot(friend.id).notice).toContain('Сначала ответь')
    expect(party.snapshot(friend.id).partyId).toBeNull()
    command(leader, { type: 'party_invite', targetId: friend.id })
    expect(party.snapshot(leader.id).notice).toContain('уже отправлено')
    expect(party.snapshot(friend.id).invitations).toEqual([invitation])
    command(friend, {
        type: 'party_answer',
        invitationId: invitation.id,
        accept: true,
    })
    expect(party.snapshot(friend.id).partyId).toBe(
        party.snapshot(leader.id).partyId
    )
    expect(
        party.snapshot(friend.id).members.map((member) => member.id)
    ).toEqual([leader.id, friend.id])
})

it('accepting one invitation removes other pending invitations for the joining character', () => {
    const { party, leader, friend, other, invite, command } = fixture()
    const accepted = invite(leader, friend)
    const stale = invite(other, friend)
    command(friend, {
        type: 'party_answer',
        invitationId: accepted.id,
        accept: true,
    })
    expect(party.snapshot(friend.id).invitations).toEqual([])
    expect(party.snapshot(other.id).invitations).toEqual([])
    command(friend, {
        type: 'party_answer',
        invitationId: stale.id,
        accept: true,
    })
    expect(party.snapshot(friend.id).leaderId).toBe(leader.id)
    expect(party.snapshot(other.id).members.map((member) => member.id)).toEqual(
        [other.id]
    )
})

it.each(['leave', 'offline', 'retired', 'dead', 'missing', 'expired'] as const)(
    'cleans up pending invitation when its sender becomes %s',
    (reason) => {
        const { party, players, leader, friend, invite, command } = fixture()
        const invitation = invite(leader, friend)
        if (reason === 'leave') {
            command(leader, { type: 'party_leave' })
        }
        if (reason === 'offline') {
            leader.tags.add('offline')
        }
        if (reason === 'retired') {
            leader.tags.add('state.retired')
        }
        if (reason === 'dead') {
            leader.applyDamage(leader.hp, 1500)
        }
        const characters =
            reason === 'missing'
                ? players.filter((actor) => actor !== leader)
                : players
        const now = reason === 'expired' ? invitation.expiresAt : 2000
        party.update(characters, now)
        expect(party.snapshot(friend.id).invitations).toEqual([])
        party.handle(
            friend,
            { type: 'party_answer', invitationId: invitation.id, accept: true },
            characters,
            now
        )
        expect(party.snapshot(friend.id).partyId).toBeNull()
    }
)

it('an old acceptance never consumes the replacement invitation after the original expires', () => {
    const { party, leader, friend, invite, command } = fixture()
    const old = invite(leader, friend)
    const replacement = invite(leader, friend, old.expiresAt)
    expect(replacement.id).not.toBe(old.id)
    command(
        friend,
        { type: 'party_answer', invitationId: old.id, accept: true },
        old.expiresAt
    )
    expect(party.snapshot(friend.id).partyId).toBeNull()
    expect(party.snapshot(friend.id).invitations).toEqual([replacement])
    command(
        friend,
        { type: 'party_answer', invitationId: replacement.id, accept: true },
        old.expiresAt
    )
    expect(party.snapshot(friend.id).leaderId).toBe(leader.id)
})

it('retains a downed member at zero percent and promotes the next leader without leaking raw HP', () => {
    const { party, players, leader, friend, other, join, command } = fixture()
    join(leader, friend)
    join(leader, other)
    friend.applyDamage(friend.hp, 1500)
    other.hp = other.maxHp * 0.375
    other.locationId = 'map-2-1'
    party.update(players, 2000)
    const snapshot = party.snapshot(leader.id)
    expect(
        snapshot.members.find((member) => member.id === friend.id)
    ).toMatchObject({ alive: false, hpPercent: 0, online: true })
    expect(
        snapshot.members.find((member) => member.id === other.id)
    ).toMatchObject({ hpPercent: 38, locationId: 'map-2-1' })
    expect(
        snapshot.members.every(
            (member) => !('hp' in member) && !('maxHp' in member)
        )
    ).toBe(true)
    command(leader, { type: 'party_leave' }, 2000)
    const promoted = party.snapshot(friend.id)
    expect(promoted.leaderId).toBe(friend.id)
    expect(promoted.members.map((member) => member.id)).toEqual([
        friend.id,
        other.id,
    ])
})

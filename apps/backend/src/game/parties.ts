import type {
    GameEventPayload,
    PartyClientMessage,
    PartyInvitationSnapshot,
    PartySnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { type GoldAwarder, GuildService } from './guild'
import { NoticeStore } from './notices'
import {
    available,
    cancelPartyInvitations,
    createPartySnapshot,
    guildContact,
    nearbyPlayers,
    type PartyRecord,
    pendingPartyInvitation,
    shouldRemoveMember,
    staleInvitation,
} from './partyRules'

export class PartyService {
    private readonly parties = new Map<string, PartyRecord>()
    private readonly membership = new Map<string, string>()
    private readonly invitations = new Map<string, PartyInvitationSnapshot>()
    private readonly notices = new NoticeStore()
    private characters = new Map<string, GameCharacter>()
    private readonly guild = new GuildService()
    private nextParty = 1
    private nextInvitation = 1

    public constructor(private awardGold: GoldAwarder = () => false) {}

    public snapshot(playerId: string): PartySnapshot {
        return createPartySnapshot(playerId, {
            parties: this.parties,
            membership: this.membership,
            invitations: this.invitations,
            notices: this.notices,
            characters: this.characters,
            guild: this.guild,
        })
    }

    public handle(
        actor: GameCharacter,
        message: PartyClientMessage,
        characters: Iterable<GameCharacter>,
        now: number
    ): GameEventPayload[] {
        this.update(characters, now)
        if (!available(actor)) {
            return this.tell(
                actor.id,
                'Живой искатель приключений должен быть в игре, чтобы принять решение.'
            )
        }
        switch (message.type) {
            case 'party_invite':
                return this.invite(actor, message.targetId, now)
            case 'party_answer':
                return this.answer(
                    actor,
                    message.invitationId,
                    message.accept,
                    now
                )
            case 'party_leave':
                this.remove(actor.id)
                return this.tell(
                    actor.id,
                    'Ты покинул группу и отказался от доли в её действующем договоре.'
                )
            case 'guild_accept':
                return this.guildAction(actor, message)
            case 'guild_turn_in':
                return this.guildAction(actor, message)
        }
    }

    public update(
        characters: Iterable<GameCharacter>,
        now: number
    ): GameEventPayload[] {
        this.characters = new Map(
            [...characters].map((character) => [character.id, character])
        )
        for (const playerId of this.membership.keys()) {
            const character = this.characters.get(playerId)
            if (shouldRemoveMember(character)) {
                this.remove(playerId)
            }
        }
        for (const [id, invitation] of this.invitations) {
            if (staleInvitation(invitation, this.characters, now)) {
                this.invitations.delete(id)
            }
        }
        for (const party of this.parties.values()) {
            this.guild.update(party.id, party.members, this.characters)
        }
        for (const character of this.characters.values()) {
            if (
                character.controllerKind === 'network_player' &&
                !this.membership.has(character.id)
            ) {
                this.guild.update(
                    `solo:${character.id}`,
                    new Set([character.id]),
                    this.characters
                )
            }
        }
        return []
    }

    public observe(
        events: GameEventPayload[],
        findCharacter: (id: string) => GameCharacter | undefined,
        awardGold?: GoldAwarder
    ): GameEventPayload[] {
        if (awardGold !== undefined) {
            this.awardGold = awardGold
        }
        for (const event of events) {
            if (event.kind === 'permadeath' && event.actorId !== undefined) {
                this.remove(event.actorId)
                this.notices.delete(event.actorId)
            }
        }
        this.guild.observe(events, findCharacter, (id) => this.groupFor(id))
        return []
    }

    private invite(
        actor: GameCharacter,
        targetId: string,
        now: number
    ): GameEventPayload[] {
        const target = this.characters.get(targetId)
        if (!nearbyPlayers(actor, target)) {
            return this.tell(
                actor.id,
                'Пригласи другого живого игрока в своей локации, не дальше 240 шагов.'
            )
        }
        const pending = pendingPartyInvitation(
            this.invitations.values(),
            actor.id,
            target.id
        )
        if (pending !== undefined) {
            return this.tell(
                actor.id,
                pending.toId === actor.id
                    ? 'Сначала ответь на полученное приглашение.'
                    : 'Приглашение уже отправлено.'
            )
        }
        if (this.membership.has(target.id)) {
            return this.tell(actor.id, 'Этот искатель уже состоит в группе.')
        }
        let party = this.parties.get(this.membership.get(actor.id) ?? '')
        if (party === undefined) {
            party = {
                id: `party_${String(this.nextParty++)}`,
                leaderId: actor.id,
                members: new Set([actor.id]),
            }
            this.parties.set(party.id, party)
            this.membership.set(actor.id, party.id)
            this.guild.moveJob(`solo:${actor.id}`, party.id)
        }
        if (party.leaderId !== actor.id || party.members.size >= 4) {
            return this.tell(
                actor.id,
                'Приглашает только лидер; в группе не больше четырёх участников.'
            )
        }
        const invitation: PartyInvitationSnapshot = {
            id: `invitation_${String(this.nextInvitation++)}`,
            fromId: actor.id,
            fromName: actor.nickname,
            toId: target.id,
            toName: target.nickname,
            expiresAt: now + 30_000,
        }
        this.invitations.set(invitation.id, invitation)
        this.notices.set(
            target.id,
            `${actor.nickname} приглашает тебя в группу. Решение за тобой.`
        )
        return this.tell(actor.id, 'Приглашение отправлено на 30 секунд.')
    }

    private answer(
        actor: GameCharacter,
        invitationId: string,
        accept: boolean,
        now: number
    ): GameEventPayload[] {
        const invitation = this.invitations.get(invitationId)
        if (invitation?.toId !== actor.id || invitation.expiresAt <= now) {
            return this.tell(actor.id, 'Приглашение недоступно или истекло.')
        }
        this.invitations.delete(invitationId)
        if (!accept) {
            return this.tell(actor.id, 'Ты отказался от приглашения.')
        }
        const leader = this.characters.get(invitation.fromId)
        const party = this.parties.get(
            this.membership.get(invitation.fromId) ?? ''
        )
        if (
            !nearbyPlayers(actor, leader) ||
            party?.leaderId !== invitation.fromId ||
            party.members.size >= 4 ||
            this.membership.has(actor.id)
        ) {
            return this.tell(
                actor.id,
                'Состав группы изменился. Попроси новое приглашение.'
            )
        }
        if (this.guild.hasActiveJob(`solo:${actor.id}`)) {
            return this.tell(
                actor.id,
                'Сначала заверши свой личный договор, чтобы не потерять его.'
            )
        }
        party.members.add(actor.id)
        this.guild.addLateMember(party.id, actor)
        this.membership.set(actor.id, party.id)
        cancelPartyInvitations(this.invitations, actor.id)
        this.notices.set(leader.id, `${actor.nickname} присоединился к группе.`)
        return this.tell(actor.id, 'Ты вступил в группу по собственной воле.')
    }

    private guildAction(
        actor: GameCharacter,
        message: Extract<
            PartyClientMessage,
            { type: 'guild_accept' | 'guild_turn_in' }
        >
    ): GameEventPayload[] {
        const group = this.groupFor(actor.id)
        const party = this.parties.get(group.key)
        if (party !== undefined && party.leaderId !== actor.id) {
            return this.tell(
                actor.id,
                'Договор принимает и сдаёт лидер группы.'
            )
        }
        if (
            ![...this.characters.values()].some((npc) =>
                guildContact(actor, npc)
            )
        ) {
            return this.tell(
                actor.id,
                'Подойди к Мире или Савве в Новогороде: не дальше 64 шагов.'
            )
        }
        const text =
            message.type === 'guild_accept'
                ? this.guild.accept(
                      group.key,
                      message.questId,
                      actor.id,
                      group.members,
                      this.characters
                  )
                : this.guild.turnIn(
                      group.key,
                      group.members,
                      this.characters,
                      this.awardGold
                  )
        for (const id of group.members) {
            this.notices.set(id, text)
        }
        return []
    }

    private groupFor(playerId: string): { key: string; members: Set<string> } {
        const party = this.parties.get(this.membership.get(playerId) ?? '')
        return party === undefined
            ? { key: `solo:${playerId}`, members: new Set([playerId]) }
            : { key: party.id, members: party.members }
    }

    private remove(playerId: string): void {
        const party = this.parties.get(this.membership.get(playerId) ?? '')
        if (party !== undefined) {
            party.members.delete(playerId)
            this.guild.removeMember(party.id, playerId)
            if (party.members.size === 0) {
                this.parties.delete(party.id)
            } else if (party.leaderId === playerId) {
                party.leaderId = [...party.members][0] ?? ''
            }
        }
        this.membership.delete(playerId)
        cancelPartyInvitations(this.invitations, playerId)
    }

    private tell(playerId: string, text: string): GameEventPayload[] {
        this.notices.set(playerId, text)
        return []
    }
}

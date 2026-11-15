import type {
    GameEventPayload,
    PartyClientMessage,
    PartyInvitationSnapshot,
    PartySnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { GuildService, type WorkerGuildGateway } from './guild'
import { NoticeStore } from './notices'
import {
    findGuildContact,
    type GuildCommand,
    handleGuildCommand,
} from './partyGuildCommands'
import { inviteToParty } from './partyInvitations'
import { removePartyMember, resolvePartyGroup } from './partyMembership'
import {
    available,
    cancelPartyInvitations,
    createPartySnapshot,
    guildContact,
    nearbyPlayers,
    type PartyRecord,
    shouldRemoveMember,
    staleInvitation,
} from './partyRules'
import type { QuestGoldAwarder } from './questRewards'

export class PartyService {
    private readonly parties = new Map<string, PartyRecord>()
    private readonly membership = new Map<string, string>()
    private readonly invitations = new Map<string, PartyInvitationSnapshot>()
    private readonly notices = new NoticeStore()
    private characters = new Map<string, GameCharacter>()
    private readonly guild: GuildService
    private currentNow = 0
    private nextParty = 1
    private nextInvitation = 1

    public constructor(
        private awardGold: QuestGoldAwarder = () => ({ ok: false, shares: [] }),
        private readonly options: {
            workers?: WorkerGuildGateway
            canContact?: (actor: GameCharacter, npc: GameCharacter) => boolean
        } = {}
    ) {
        this.guild = new GuildService(options.workers)
    }

    public rewardMembers(actorId: string): string[] {
        return [...this.groupFor(actorId).members].filter(
            (id) => !shouldRemoveMember(this.characters.get(id))
        )
    }

    private contactFor(
        actor: GameCharacter,
        now: number,
        questId?: string
    ): GameCharacter | undefined {
        return findGuildContact(
            this.guild,
            this.groupFor(actor.id).key,
            actor,
            this.characters,
            this.options.canContact ?? guildContact,
            now,
            questId
        )
    }

    public snapshot(playerId: string): PartySnapshot {
        const actor = this.characters.get(playerId)
        return createPartySnapshot(playerId, {
            parties: this.parties,
            membership: this.membership,
            invitations: this.invitations,
            notices: this.notices,
            characters: this.characters,
            guild: this.guild,
            contact:
                actor === undefined
                    ? undefined
                    : this.contactFor(actor, this.currentNow),
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
                    'Ты покинул группу. Награда делится между участниками группы на момент сдачи.'
                )
            case 'guild_accept':
                return this.guildAction(actor, message, now)
            case 'guild_turn_in':
            case 'guild_report':
            case 'guild_abandon':
                return this.guildAction(actor, message, now)
        }
    }

    public update(
        characters: Iterable<GameCharacter>,
        now: number
    ): GameEventPayload[] {
        this.currentNow = now
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
        awardGold?: QuestGoldAwarder
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
        return this.tell(
            actor.id,
            inviteToParty(actor, targetId, now, {
                characters: this.characters,
                membership: this.membership,
                parties: this.parties,
                invitations: this.invitations,
                notices: this.notices,
                guild: this.guild,
                newPartyId: () => `party_${String(this.nextParty++)}`,
                newInvitationId: () =>
                    `invitation_${String(this.nextInvitation++)}`,
            })
        )
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
        message: GuildCommand,
        now: number
    ): GameEventPayload[] {
        const group = this.groupFor(actor.id)
        return handleGuildCommand({
            guild: this.guild,
            group,
            actor,
            message,
            characters: this.characters,
            award: this.awardGold,
            now,
            notices: this.notices,
            leaderId: this.parties.get(group.key)?.leaderId,
            contact:
                message.type === 'guild_abandon' ||
                this.contactFor(
                    actor,
                    now,
                    message.type === 'guild_accept'
                        ? message.questId
                        : undefined
                ) !== undefined,
        })
    }

    private groupFor(playerId: string): { key: string; members: Set<string> } {
        return resolvePartyGroup(playerId, this.parties, this.membership)
    }

    private remove(playerId: string): void {
        removePartyMember(
            playerId,
            this.parties,
            this.membership,
            this.guild,
            this.invitations
        )
    }

    private tell(playerId: string, text: string): GameEventPayload[] {
        this.notices.set(playerId, text)
        return []
    }
}

import type {
    PartyClientMessage,
    QuestRewardMode,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GuildService } from './guild'
import type { NegotiatedWorkerReward } from './guildRewards'
import type { NoticeStore } from './notices'
import type { NpcQuestResult } from './npcQuestTypes'
import { available } from './partyRules'
import type { QuestGoldAwarder } from './questRewards'

export type GuildCommand = Extract<
    PartyClientMessage,
    {
        type:
            'guild_accept' | 'guild_turn_in' | 'guild_report' | 'guild_abandon'
    }
>

interface GuildCommandContext {
    guild: GuildService
    group: { key: string; members: Set<string> }
    actor: GameCharacter
    message: GuildCommand
    characters: Map<string, GameCharacter>
    award: QuestGoldAwarder
    now: number
    issuer?: GameCharacter
    negotiated?: NegotiatedWorkerReward
}

export function executeGuildCommand(input: GuildCommandContext): string {
    const { guild, group, actor, message, characters, award, now } = input
    switch (message.type) {
        case 'guild_accept':
            return guild.accept(
                group.key,
                message.questId,
                actor.id,
                group.members,
                characters,
                message.rewardMode,
                now,
                input.negotiated,
                input.issuer?.id
            )
        case 'guild_report':
            return guild.report(group.key, message.instanceId, actor, now)
        case 'guild_abandon':
            return guild.abandon(group.key, message.instanceId, now)
        case 'guild_turn_in':
            return guild.turnIn(
                group.key,
                message.instanceId,
                actor.id,
                group.members,
                characters,
                award,
                now
            )
    }
}

export function handleGuildCommand(
    input: GuildCommandContext & {
        notices: NoticeStore
        leaderId: string | undefined
        contact: boolean
    }
): [] {
    if (input.leaderId !== undefined && input.leaderId !== input.actor.id) {
        input.notices.set(
            input.actor.id,
            'Договор принимает и сдаёт лидер группы.'
        )
        return []
    }
    if (!input.contact) {
        input.notices.set(
            input.actor.id,
            'Подойди к живому представителю гильдии в пределах видимости.'
        )
        return []
    }
    const text = executeGuildCommand(input)
    for (const id of input.group.members) {
        input.notices.set(id, text)
    }
    return []
}

export function findGuildContact(
    guild: GuildService,
    key: string,
    actor: GameCharacter,
    characters: ReadonlyMap<string, GameCharacter>,
    canContact: (actor: GameCharacter, npc: GameCharacter) => boolean,
    now: number,
    questId?: string
): GameCharacter | undefined {
    return [...characters.values()].find(
        (npc) =>
            canContact(actor, npc) &&
            guild.contactAllowed(key, actor, npc, now, questId)
    )
}

interface PartyGuildEnvironment {
    guild: () => GuildService
    group: (id: string) => { key: string; members: Set<string> }
    characters: () => Map<string, GameCharacter>
    award: () => QuestGoldAwarder
    leader: (key: string) => string | undefined
    canContact: (actor: GameCharacter, npc: GameCharacter) => boolean
    notices: NoticeStore
}

export function partyGuildContact(
    environment: PartyGuildEnvironment,
    actor: GameCharacter,
    now: number,
    questId?: string
) {
    return findGuildContact(
        environment.guild(),
        environment.group(actor.id).key,
        actor,
        environment.characters(),
        environment.canContact,
        now,
        questId
    )
}

export function createPartyGuildAction(environment: PartyGuildEnvironment) {
    return (
        actor: GameCharacter,
        message: GuildCommand,
        now: number,
        negotiated?: NegotiatedWorkerReward
    ): [] => {
        const group = environment.group(actor.id)
        const contact =
            message.type === 'guild_abandon'
                ? undefined
                : partyGuildContact(
                      environment,
                      actor,
                      now,
                      message.type === 'guild_accept'
                          ? message.questId
                          : undefined
                  )
        return handleGuildCommand({
            guild: environment.guild(),
            group,
            actor,
            message,
            characters: environment.characters(),
            award: environment.award(),
            now,
            notices: environment.notices,
            leaderId: environment.leader(group.key),
            ...(contact === undefined ? {} : { issuer: contact }),
            ...(negotiated === undefined ? {} : { negotiated }),
            contact:
                message.type === 'guild_abandon' ||
                (contact !== undefined &&
                    (negotiated === undefined ||
                        contact.id === negotiated.issuerId)),
        })
    }
}

export function createBoardGuildAcceptance(environment: PartyGuildEnvironment) {
    return (
        actor: GameCharacter,
        questId: string,
        issuer: GameCharacter,
        rewardMode: QuestRewardMode,
        now: number,
        report = false
    ): NpcQuestResult => {
        const { key, members } = environment.group(actor.id)
        const guild = environment.guild()
        if (
            !available(actor) ||
            (environment.leader(key) ?? actor.id) !== actor.id ||
            !canAcceptBoardFrom(environment, actor, issuer, now, questId)
        ) {
            return {
                accepted: false,
                error: 'Этот договор сейчас недоступен.',
                events: [],
            }
        }
        if (guild.hasActiveJob(key)) {
            return {
                accepted: false,
                error: 'Сначала завершите действующий договор.',
                events: [],
            }
        }
        const notice = guild.accept(
            key,
            questId,
            actor.id,
            members,
            environment.characters(),
            rewardMode,
            now,
            undefined,
            issuer.id,
            report ? actor : undefined
        )
        const accepted = guild.snapshot(key)?.id === questId
        if (accepted) {
            for (const id of members) {
                environment.notices.set(id, notice)
            }
        }
        return { accepted, error: accepted ? null : notice, events: [] }
    }
}

function canAcceptBoardFrom(
    environment: PartyGuildEnvironment,
    actor: GameCharacter,
    issuer: GameCharacter,
    now: number,
    questId: string
): boolean {
    return (
        environment.canContact(actor, issuer) &&
        environment
            .guild()
            .contactAllowed(
                environment.group(actor.id).key,
                actor,
                issuer,
                now,
                questId
            )
    )
}

import type { PartyClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GuildService } from './guild'
import type { NoticeStore } from './notices'
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
                now
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

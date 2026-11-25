import type {
    GuildQuestDefinition,
    GuildQuestId,
    QuestRewardMode,
    QuestRewardShare,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { ashSummoner } from './ashSkeletonState'
import type { GameCharacter } from './character'
import type { GuildRewardPromise } from './guildRewards'
import { resetMartyrStreak } from './martyr'
import { distance } from './math'

export function resetSubmitterMartyr(
    characters: ReadonlyMap<string, GameCharacter>,
    id: string
): void {
    const submitter = characters.get(id)
    if (submitter !== undefined) {
        resetMartyrStreak(submitter)
    }
}

export interface GuildJob {
    issuerId?: string
    issuerName?: string
    reward?: GuildRewardPromise
    closeDeathListener?: () => void
    cancelled?: boolean
    rewardNotice?: string | null
    acceptedBy: string
    completed: boolean
    definition: GuildQuestDefinition
    id: string
    rewardMode: QuestRewardMode
    rewardShares?: QuestRewardShare[]
    participants: Map<
        string,
        {
            nickname: string
            contribution: number
            eligible: boolean
            visited: Set<string>
        }
    >
    progress: number
    visited: Set<string>
}

export function addGuildParticipant(
    job: GuildJob | undefined,
    character: GameCharacter
): void {
    if (job === undefined || job.completed || job.cancelled === true) {
        return
    }
    const existing = job.participants.get(character.id)
    if (existing !== undefined) {
        existing.eligible = true
        return
    }
    job.participants.set(character.id, {
        nickname: character.nickname,
        contribution: 0,
        eligible: true,
        visited: new Set(),
    })
}

export function removeGuildParticipant(
    job: GuildJob | undefined,
    playerId: string
): void {
    if (job === undefined || job.completed || job.cancelled === true) {
        return
    }
    const participant = job.participants.get(playerId)
    if (participant !== undefined) {
        participant.eligible = false
    }
}

export const guildQuests: Array<GuildQuestDefinition & { id: GuildQuestId }> = [
    {
        id: 'slime_hunt',
        titleMessage: { key: 'authored.guild.quest.slimeHuntTitle' },
        descriptionMessage: {
            key: 'authored.guild.quest.slimeHuntDescription',
        },
        title: 'Зачистка троп',
        description:
            'Победите трёх враждебных слизней. Для общего прогресса участник отряда должен быть рядом с победой.',
        goal: 3,
        rewardGold: 30,
    },
    {
        id: 'skeleton_hunt',
        titleMessage: { key: 'authored.guild.quest.skeletonHuntTitle' },
        descriptionMessage: {
            key: 'authored.guild.quest.skeletonHuntDescription',
        },
        title: 'Кости старого тракта',
        description:
            'Победите двух скелетов одной группой. Победы засчитываются при участии отряда поблизости.',
        goal: 2,
        rewardGold: 40,
    },
    {
        id: 'survey_frontier',
        titleMessage: { key: 'authored.guild.quest.frontierTitle' },
        descriptionMessage: { key: 'authored.guild.quest.frontierDescription' },
        title: 'Разведчики Пограничья',
        description:
            'Исследуйте три разные земли за пределами Новогорода. Отряд делится результатами разведки.',
        goal: 3,
        rewardGold: 35,
    },
]

export function questDeath(target: GameCharacter): boolean {
    return (
        !target.alive &&
        ashSummoner(target) === undefined &&
        target.faction === 'monsters' &&
        target.controllerKind !== 'network_player'
    )
}

export function guildHuntArchetype(
    id: string
): 'slime' | 'skeleton' | undefined {
    switch (id) {
        case 'slime_hunt':
            return 'slime'
        case 'skeleton_hunt':
            return 'skeleton'
        default:
            return undefined
    }
}

function matchesJob(job: GuildJob, target: GameCharacter): boolean {
    return guildHuntArchetype(job.definition.id) === target.archetype
}

export function canContribute(
    character: GameCharacter | undefined
): character is GameCharacter {
    return (
        character !== undefined &&
        character.alive &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired')
    )
}

export function nearKill(
    character: GameCharacter | undefined,
    target: GameCharacter
): boolean {
    return (
        canContribute(character) &&
        character.locationId === target.locationId &&
        distance(character.position, target.position) <= 240
    )
}

export function rewardEligible(
    id: string,
    members: Set<string>,
    character: GameCharacter | undefined
): boolean {
    return (
        members.has(id) &&
        character !== undefined &&
        character.connected &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired')
    )
}

export function creditOwnerId(killer: GameCharacter): string | undefined {
    return killer.controllerKind === 'network_player'
        ? killer.id
        : (killer.soul.companion?.leaderId ?? undefined)
}

export function canAdvanceJob(
    job: GuildJob | undefined,
    target: GameCharacter
): job is GuildJob {
    return (
        job !== undefined &&
        !job.completed &&
        job.progress < job.definition.goal &&
        matchesJob(job, target)
    )
}

export function contributorsFor(
    job: GuildJob,
    members: Set<string>,
    find: (id: string) => GameCharacter | undefined,
    target: GameCharacter
): Array<[string, { contribution: number }]> {
    return [...job.participants].filter(
        ([id, participant]) =>
            participant.eligible &&
            members.has(id) &&
            nearKill(find(id), target)
    )
}

export function createGuildParticipants(
    members: Set<string>,
    characters: Map<string, GameCharacter>
): GuildJob['participants'] {
    const participants: GuildJob['participants'] = new Map()
    for (const id of members) {
        const character = characters.get(id)
        if (character !== undefined) {
            participants.set(id, {
                nickname: character.nickname,
                contribution: 0,
                eligible: true,
                visited: new Set(),
            })
        }
    }
    return participants
}

export function advanceExploration(
    job: GuildJob,
    members: Set<string>,
    characters: Map<string, GameCharacter>,
    scoutingLocationId?: (locationId: string) => string
): void {
    for (const [id, participant] of job.participants) {
        const character = characters.get(id)
        if (
            !participant.eligible ||
            !members.has(id) ||
            !canContribute(character)
        ) {
            continue
        }
        const locationId =
            scoutingLocationId?.(character.locationId) ?? character.locationId
        if (
            locationId === CENTER_LOCATION_ID ||
            participant.visited.has(locationId)
        ) {
            continue
        }
        participant.visited.add(locationId)
        participant.contribution += 1
        job.visited.add(locationId)
        job.progress = Math.min(job.definition.goal, job.visited.size)
    }
}

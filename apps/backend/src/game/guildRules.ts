import type {
    GuildQuestDefinition,
    QuestRewardMode,
    QuestRewardShare,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'

export interface GuildJob {
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

export const guildQuests: GuildQuestDefinition[] = [
    {
        id: 'slime_hunt',
        title: 'Зачистка троп',
        description:
            'Победите трёх враждебных слизней. Для общего прогресса участник отряда должен быть рядом с победой.',
        goal: 3,
        rewardGold: 30,
    },
    {
        id: 'skeleton_hunt',
        title: 'Кости старого тракта',
        description:
            'Победите двух скелетов одной группой. Победы засчитываются при участии отряда поблизости.',
        goal: 2,
        rewardGold: 40,
    },
    {
        id: 'survey_frontier',
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
        target.faction === 'monsters' &&
        target.controllerKind !== 'network_player'
    )
}

export function matchesJob(job: GuildJob, target: GameCharacter): boolean {
    return (
        (job.definition.id === 'slime_hunt' && target.archetype === 'slime') ||
        (job.definition.id === 'skeleton_hunt' &&
            target.archetype === 'skeleton')
    )
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
    characters: Map<string, GameCharacter>
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
        if (
            character.locationId === CENTER_LOCATION_ID ||
            participant.visited.has(character.locationId)
        ) {
            continue
        }
        participant.visited.add(character.locationId)
        participant.contribution += 1
        job.visited.add(character.locationId)
        job.progress = Math.min(job.definition.goal, job.visited.size)
    }
}

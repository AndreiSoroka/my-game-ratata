import type { GuildQuestDefinition } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'

export interface GuildJob {
    completed: boolean
    definition: GuildQuestDefinition
    id: string
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
            'Победите трёх враждебных слизней. Участники должны быть рядом с добычей, а не ждать награду в другом краю.',
        goal: 3,
        rewardGold: 30,
    },
    {
        id: 'skeleton_hunt',
        title: 'Кости старого тракта',
        description:
            'Победите двух скелетов одной группой. Награда достанется участникам принятого договора, которые помогали рядом.',
        goal: 2,
        rewardGold: 40,
    },
    {
        id: 'survey_frontier',
        title: 'Разведчики Пограничья',
        description:
            'Исследуйте три разные земли за пределами Новогорода. Каждый оплачиваемый участник должен сам выйти в разведку.',
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
    participant: { eligible: boolean; contribution: number },
    id: string,
    members: Set<string>,
    character: GameCharacter | undefined
): boolean {
    return (
        participant.eligible &&
        participant.contribution > 0 &&
        members.has(id) &&
        character !== undefined &&
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

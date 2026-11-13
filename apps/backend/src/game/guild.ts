import type {
    GameEventPayload,
    GuildQuestId,
    GuildQuestSnapshot,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    canAdvanceJob,
    canContribute,
    contributorsFor,
    creditOwnerId,
    type GuildJob,
    guildQuests,
    nearKill,
    questDeath,
    rewardEligible,
} from './guildRules'
export { guildQuests } from './guildRules'

export type GoldAwarder = (
    playerId: string,
    amount: number,
    rewardId: string
) => boolean

export class GuildService {
    private readonly jobs = new Map<string, GuildJob>()
    private readonly completed = new Map<string, Set<GuildQuestId>>()
    private readonly deaths = new Map<string, number>()
    private nextJob = 1

    public snapshot(key: string): GuildQuestSnapshot | null {
        const job = this.jobs.get(key)
        if (job === undefined) {
            return null
        }
        return {
            ...job.definition,
            participants: [...job.participants].map(([id, entry]) => ({
                id,
                nickname: entry.nickname,
                contribution: entry.contribution,
                eligible: entry.eligible,
            })),
            progress: job.progress,
            status: job.completed
                ? 'completed'
                : job.progress >= job.definition.goal
                  ? 'ready'
                  : 'active',
        }
    }

    public accept(
        key: string,
        questId: GuildQuestId,
        leader: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>
    ): string {
        const current = this.jobs.get(key)
        if (current !== undefined && !current.completed) {
            return 'Сначала завершите действующий договор.'
        }
        const definition = guildQuests.find((quest) => quest.id === questId)
        if (
            definition === undefined ||
            this.completed.get(leader)?.has(questId) === true
        ) {
            return 'Этот договор уже выполнен этой личностью или недоступен.'
        }
        const participants: GuildJob['participants'] = new Map()
        for (const id of members) {
            const character = characters.get(id)
            if (character !== undefined) {
                participants.set(id, {
                    nickname: character.nickname,
                    contribution: 0,
                    eligible: this.completed.get(id)?.has(questId) !== true,
                    visited: new Set(),
                })
            }
        }
        this.jobs.set(key, {
            completed: false,
            definition,
            id: `guild-contract-${String(this.nextJob++)}`,
            participants,
            progress: 0,
            visited: new Set(),
        })
        return 'Договор принят. Состав участников зафиксирован; вступившие позже могут помогать без награды за этот договор.'
    }

    public moveJob(from: string, to: string): void {
        const job = this.jobs.get(from)
        if (job !== undefined) {
            this.jobs.set(to, job)
            this.jobs.delete(from)
        }
    }

    public hasActiveJob(key: string): boolean {
        const job = this.jobs.get(key)
        return job !== undefined && !job.completed
    }

    public addLateMember(key: string, character: GameCharacter): void {
        const job = this.jobs.get(key)
        if (job !== undefined && !job.participants.has(character.id)) {
            job.participants.set(character.id, {
                nickname: character.nickname,
                contribution: 0,
                eligible: false,
                visited: new Set(),
            })
        }
    }

    public removeMember(key: string, playerId: string): void {
        const participant = this.jobs.get(key)?.participants.get(playerId)
        if (participant !== undefined) {
            participant.eligible = false
        }
    }

    public observe(
        events: GameEventPayload[],
        find: (id: string) => GameCharacter | undefined,
        group: (id: string) => { key: string; members: Set<string> }
    ): void {
        for (const event of events) {
            if (event.kind === 'respawn' && event.actorId !== undefined) {
                this.deaths.delete(event.actorId)
            }
            if (event.kind === 'death') {
                this.creditDeath(event, find, group)
            }
        }
    }

    public update(
        key: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>
    ): void {
        const job = this.jobs.get(key)
        if (
            job === undefined ||
            job.completed ||
            job.definition.id !== 'survey_frontier' ||
            job.progress >= job.definition.goal
        ) {
            return
        }
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

    public turnIn(
        key: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>,
        award: GoldAwarder
    ): string {
        const job = this.jobs.get(key)
        if (job === undefined || job.completed) {
            return 'Нет готового неоплаченного договора.'
        }
        if (job.progress < job.definition.goal) {
            return 'Условия договора ещё не выполнены.'
        }
        let paid = 0
        for (const [id, participant] of job.participants) {
            const character = characters.get(id)
            if (!rewardEligible(participant, id, members, character)) {
                continue
            }
            if (this.completed.get(id)?.has(job.definition.id) === true) {
                continue
            }
            if (!award(id, job.definition.rewardGold, job.id)) {
                return 'Казначейство не подтвердило выплату. Попробуйте ещё раз.'
            }
            const completed = this.completed.get(id) ?? new Set<GuildQuestId>()
            completed.add(job.definition.id)
            this.completed.set(id, completed)
            paid += 1
        }
        job.completed = true
        return `Договор закрыт. Награда: ${String(job.definition.rewardGold)} золотых каждому из ${String(paid)} заслуживших её участников.`
    }

    private creditDeath(
        event: GameEventPayload,
        find: (id: string) => GameCharacter | undefined,
        group: (id: string) => { key: string; members: Set<string> }
    ): void {
        const killer = find(event.actorId ?? '')
        const target = find(event.targetId ?? '')
        if (
            killer === undefined ||
            target === undefined ||
            !questDeath(target) ||
            this.deaths.get(target.id) === target.respawnAt
        ) {
            return
        }
        this.deaths.set(target.id, target.respawnAt)
        const creditId = creditOwnerId(killer)
        if (creditId === undefined) {
            return
        }
        const actor = find(creditId)
        if (!nearKill(actor, target)) {
            return
        }
        const roster = group(creditId)
        const job = this.jobs.get(roster.key)
        if (!canAdvanceJob(job, target)) {
            return
        }
        const contributors = contributorsFor(job, roster.members, find, target)
        if (contributors.length === 0) {
            return
        }
        job.progress += 1
        for (const [, participant] of contributors) {
            participant.contribution += 1
        }
    }
}

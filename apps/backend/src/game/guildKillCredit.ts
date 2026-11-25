import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { creditsDefeat } from './damageEvents'
import {
    canAdvanceJob,
    contributorsFor,
    creditOwnerId,
    type GuildJob,
    nearKill,
    questDeath,
} from './guildRules'

export class GuildKillCredit {
    private readonly deaths = new Map<string, number>()

    public observe(
        events: GameEventPayload[],
        find: (id: string) => GameCharacter | undefined,
        group: (id: string) => { key: string; members: Set<string> },
        jobs: (key: string) => readonly GuildJob[]
    ): void {
        for (const event of events) {
            if (event.kind === 'respawn' && event.actorId !== undefined) {
                this.deaths.delete(event.actorId)
            }
            if (creditsDefeat(event)) {
                this.creditDeath(event, find, group, jobs)
            }
        }
    }

    private creditDeath(
        event: GameEventPayload,
        find: (id: string) => GameCharacter | undefined,
        group: (id: string) => { key: string; members: Set<string> },
        jobs: (key: string) => readonly GuildJob[]
    ): void {
        const killer = find(event.actorId ?? '')
        const target = find(event.targetId ?? '')
        if (
            killer === undefined ||
            target === undefined ||
            !questDeath(target) ||
            this.deaths.get(target.id) === target.deathSequence
        ) {
            return
        }
        this.deaths.set(target.id, target.deathSequence)
        const creditId = creditOwnerId(killer)
        if (creditId === undefined) {
            return
        }
        const actor = find(creditId)
        if (!nearKill(actor, target)) {
            return
        }
        const roster = group(creditId)
        for (const job of jobs(roster.key)) {
            advanceHunt(job, target, roster.members, find)
        }
    }
}

function advanceHunt(
    job: GuildJob,
    target: GameCharacter,
    members: Set<string>,
    find: (id: string) => GameCharacter | undefined
): void {
    if (!canAdvanceJob(job, target)) {
        return
    }
    const contributors = contributorsFor(job, members, find, target)
    if (contributors.length === 0) {
        return
    }
    job.progress += 1
    for (const [, participant] of contributors) {
        participant.contribution += 1
    }
}

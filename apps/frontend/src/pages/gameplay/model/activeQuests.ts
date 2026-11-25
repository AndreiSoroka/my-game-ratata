import type {
    AdventureQuestSnapshot,
    GuildQuestSnapshot,
    NpcQuestSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

export type ActiveQuestEntry =
    | { key: string; source: 'story'; quest: AdventureQuestSnapshot; trophies: number }
    | { key: string; source: 'guild'; quest: GuildQuestSnapshot }
    | { key: string; source: 'npc'; quest: NpcQuestSnapshot }

export function activeQuests(snapshot: WorldSnapshot | undefined): ActiveQuestEntry[] {
    return snapshot
        ? [...storyQuests(snapshot), ...guildQuests(snapshot), ...npcQuests(snapshot)]
        : []
}
function storyQuests(snapshot: WorldSnapshot): ActiveQuestEntry[] {
    const story = snapshot.adventure?.quest
    return story && ['active', 'ready'].includes(story.status)
        ? [
              {
                  key: `story:${story.id}`,
                  source: 'story',
                  quest: story,
                  trophies: snapshot.adventure?.trophies ?? 0,
              },
          ]
        : []
}
function guildQuests(snapshot: WorldSnapshot): ActiveQuestEntry[] {
    return (snapshot.party?.activeJobs ?? [])
        .filter((quest) => isActive(quest.status) && quest.workRequest?.stage !== 'cancelled')
        .map((quest) => ({ key: `guild:${quest.instanceId}`, source: 'guild', quest }))
}
function npcQuests(snapshot: WorldSnapshot): ActiveQuestEntry[] {
    return (snapshot.social?.quests ?? [])
        .filter((quest) => isActive(quest.status))
        .map((quest) => ({ key: `npc:${quest.instanceId}`, source: 'npc', quest }))
}

function isActive(status: string): boolean {
    return ['active', 'ready', 'reward_missing'].includes(status)
}

export function questStatusLabel(status: string): string {
    return status === 'ready'
        ? tGame('game.quests.readyToTurnIn')
        : status === 'reward_missing'
          ? tGame('game.quests.rewardMissing')
          : tGame('game.quests.inProgress')
}

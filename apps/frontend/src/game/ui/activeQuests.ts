import type {
    AdventureQuestSnapshot,
    GuildQuestSnapshot,
    NpcQuestSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

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
    const guild = snapshot.party?.activeJob
    return guild &&
        ['active', 'ready', 'reward_missing'].includes(guild.status) &&
        guild.workRequest?.stage !== 'cancelled'
        ? [{ key: `guild:${guild.instanceId}`, source: 'guild', quest: guild }]
        : []
}
function npcQuests(snapshot: WorldSnapshot): ActiveQuestEntry[] {
    const npc = snapshot.social?.quest
    return npc && ['active', 'ready', 'reward_missing'].includes(npc.status)
        ? [{ key: `npc:${npc.instanceId}`, source: 'npc', quest: npc }]
        : []
}

export function questStatusLabel(status: string): string {
    return status === 'ready'
        ? 'Готово к сдаче'
        : status === 'reward_missing'
          ? 'Обещанная награда недоступна'
          : 'Выполняется'
}

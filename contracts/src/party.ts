export type GuildQuestId = 'slime_hunt' | 'skeleton_hunt' | 'survey_frontier'

export type PartyClientMessage =
    | { type: 'party_invite'; targetId: string }
    | { type: 'party_answer'; invitationId: string; accept: boolean }
    | { type: 'party_leave' }
    | { type: 'guild_accept'; questId: string; rewardMode?: QuestRewardMode }
    | { type: 'guild_turn_in'; instanceId: string }
    | { type: 'guild_report'; instanceId: string }
    | { type: 'guild_abandon'; instanceId: string }

export interface PartyMemberSnapshot {
    alive: boolean
    hpPercent: number
    id: string
    locationId: string
    nickname: string
    online: boolean
}

export interface PartyInvitationSnapshot {
    expiresAt: number
    fromId: string
    fromName: string
    id: string
    toId: string
    toName: string
}

export interface GuildQuestDefinition {
    description: string
    goal: number
    id: string
    rewardGold: number
    title: string
    workRequest?: WorkRequestSnapshot
}

export interface GuildParticipantSnapshot {
    contribution: number
    eligible: boolean
    id: string
    nickname: string
}

export interface GuildQuestSnapshot extends GuildQuestDefinition {
    instanceId: string
    rewardMode: QuestRewardMode
    rewardShares?: QuestRewardShare[]
    participants: GuildParticipantSnapshot[]
    progress: number
    status: 'active' | 'ready' | 'completed'
}

export interface PartySnapshot {
    guildContact?: { npcId: string; nickname: string } | null
    activeJob: GuildQuestSnapshot | null
    invitations: PartyInvitationSnapshot[]
    jobs: GuildQuestDefinition[]
    leaderId: string | null
    members: PartyMemberSnapshot[]
    noticeId?: number
    notice: string | null
    partyId: string | null
}
import type { QuestRewardMode, QuestRewardShare } from './questRewards'
import type { WorkRequestSnapshot } from './workerRequests'

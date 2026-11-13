export type GuildQuestId = 'slime_hunt' | 'skeleton_hunt' | 'survey_frontier'

export type PartyClientMessage =
    | { type: 'party_invite'; targetId: string }
    | { type: 'party_answer'; invitationId: string; accept: boolean }
    | { type: 'party_leave' }
    | { type: 'guild_accept'; questId: GuildQuestId }
    | { type: 'guild_turn_in' }

export interface PartyMemberSnapshot {
    alive: boolean
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
    id: GuildQuestId
    rewardGold: number
    title: string
}

export interface GuildParticipantSnapshot {
    contribution: number
    eligible: boolean
    id: string
    nickname: string
}

export interface GuildQuestSnapshot extends GuildQuestDefinition {
    participants: GuildParticipantSnapshot[]
    progress: number
    status: 'active' | 'ready' | 'completed'
}

export interface PartySnapshot {
    activeJob: GuildQuestSnapshot | null
    invitations: PartyInvitationSnapshot[]
    jobs: GuildQuestDefinition[]
    leaderId: string | null
    members: PartyMemberSnapshot[]
    noticeId?: number
    notice: string | null
    partyId: string | null
}

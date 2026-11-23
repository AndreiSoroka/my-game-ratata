import { workshopFor } from '@my-game-ratata/contracts'

import type { NpcAiRole } from '../ai/types'

interface NpcRoleConfig {
    role: NpcAiRole
    mode: 'controller' | 'dialogue_only'
}

const activeNpcRoles: Readonly<Record<string, NpcAiRole>> = {
    npc_friendly_girl_1: 'city_coordinator',
    npc_necromancer_1: 'necromancer',
    npc_magic_slime_1: 'companion',
    npc_princess_1: 'companion',
    npc_veteran_1: 'companion',
}

const passiveNpcs = [
    'npc_merchant_1',
    'npc_herbalist_1',
    'npc_weaver_1',
    'npc_cartographer_1',
    'npc_scholar_1',
    'npc_tailor_1',
    'npc_smith_1',
    'npc_cleric_1',
    'npc_baker_1',
]

const scriptedResidents = new Set([
    'npc_lumberjack_1',
    'npc_miner_1',
    'npc_farmer_1',
    'npc_guard_1',
    'npc_wanderer_1',
    'npc_wanderer_2',
])

export const npcAiRoster: Readonly<Record<string, NpcRoleConfig>> =
    Object.fromEntries<NpcRoleConfig>([
        ...Object.entries(activeNpcRoles).map(
            ([id, role]): [string, NpcRoleConfig] => [
                id,
                { role, mode: 'controller' },
            ]
        ),
        ...passiveNpcs.map((id): [string, NpcRoleConfig] => [
            id,
            { role: 'advisor', mode: 'dialogue_only' },
        ]),
    ])

export function isConversationOnly(
    role: NpcAiRole,
    mode?: NpcRoleConfig['mode']
): boolean {
    return (
        mode === 'dialogue_only' || role === 'advisor' || role === 'necromancer'
    )
}

export function npcModelRole(actorId: string): NpcAiRole | undefined {
    return npcAiRoster[actorId]?.role
}

export function npcDialogueMode(
    actorId: string
): 'active' | 'passive' | 'scripted' {
    const mode = npcAiRoster[actorId]?.mode
    return mode === undefined
        ? 'scripted'
        : mode === 'controller'
          ? 'active'
          : 'passive'
}

export function recruitableNpc(actorId: string): boolean {
    return npcModelRole(actorId) === 'companion'
}

export function scriptedResident(actorId: string): boolean {
    return scriptedResidents.has(actorId)
}

export const npcServiceOffers = [
    'shop',
    'orders',
    'repair',
    'study',
    'prayer',
] as const
export type NpcServiceOffer = (typeof npcServiceOffers)[number]

export function npcCanOfferService(
    actorId: string,
    service: NpcServiceOffer
): boolean {
    if (npcDialogueMode(actorId) !== 'passive') {
        return false
    }
    switch (service) {
        case 'shop':
            return actorId === 'npc_merchant_1'
        case 'orders':
            return workshopFor(actorId) !== undefined
        case 'repair':
            return workshopFor(actorId)?.repair === true
        case 'study':
            return actorId === 'npc_scholar_1'
        case 'prayer':
            return actorId === 'npc_cleric_1'
    }
}

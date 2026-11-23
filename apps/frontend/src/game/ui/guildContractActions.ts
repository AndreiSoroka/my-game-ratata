import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import type { InteractionAction } from './nearbyInteractionActions'

export function availableGuildContracts({ party, social }: WorldSnapshot, playerId: string) {
    if (
        !party?.guildContact ||
        (party.leaderId !== null && party.leaderId !== playerId) ||
        (party.activeJob !== null && party.activeJob.status !== 'completed') ||
        ['active', 'ready', 'reward_missing'].includes(social?.quest?.status ?? '')
    )
        return []

    return party.jobs.filter(
        (job) => job.workRequest === undefined && job.id !== party.activeJob?.id
    )
}

export function guildContractActions(
    player: CharacterSnapshot,
    target: CharacterSnapshot,
    snapshot: WorldSnapshot
): InteractionAction[] {
    if (!target.alive || snapshot.party?.guildContact?.npcId !== target.id) return []

    return availableGuildContracts(snapshot, player.id).map((job) => ({
        id: `guild-accept:${target.id}:${job.id}`,
        label: tGame('game.world.takeContract', { title: job.title, gold: job.rewardGold }),
        command: { type: 'guild_accept', questId: job.id },
    }))
}

import type { CharacterSnapshot, PartySnapshot } from '@my-game-ratata/contracts'

import type { InteractionAction } from './nearbyInteractionActions'

const rewardChoices = [
    { mode: 'party_equal', label: 'Поровну группе' },
    { mode: 'submitter', label: 'Вся награда сдающему' },
] as const

export function guildContractActions(
    player: CharacterSnapshot,
    target: CharacterSnapshot,
    party?: PartySnapshot
): InteractionAction[] {
    if (
        !target.alive ||
        party?.guildContact?.npcId !== target.id ||
        (party.leaderId !== null && party.leaderId !== player.id) ||
        (party.activeJob !== null && party.activeJob.status !== 'completed')
    )
        return []

    return party.jobs
        .filter((job) => job.workRequest === undefined && job.id !== party.activeJob?.id)
        .flatMap((job) =>
            rewardChoices.map<InteractionAction>(({ mode, label }) => ({
                id: `guild-accept:${target.id}:${job.id}:${mode}`,
                label: `Взять «${job.title}» · ${job.rewardGold} ◈ · ${label}`,
                command: { type: 'guild_accept', questId: job.id, rewardMode: mode },
            }))
        )
}

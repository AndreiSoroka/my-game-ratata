import {
    type AdventureDialogue,
    authoredMessage,
    authoredPhrase,
    authoredRussian,
    type AuthoredTextKey,
    type LocalizedMessage,
} from '@my-game-ratata/contracts'

const greetings: Partial<Record<string, AuthoredTextKey>> = {
    npc_guard_1: 'resident.guard',
    npc_cleric_1: 'resident.cleric',
    npc_scholar_1: 'resident.scholar',
    npc_princess_1: 'resident.princess',
    npc_veteran_1: 'resident.veteran',
    npc_magic_slime_1: 'resident.kaplya',
    npc_wanderer_1: 'resident.wanderer1',
    npc_wanderer_2: 'resident.wanderer2',
    npc_weaver_1: 'resident.weaver',
    npc_smith_1: 'resident.smith',
    npc_herbalist_1: 'resident.herbalist',
    npc_baker_1: 'resident.baker',
    npc_cartographer_1: 'resident.cartographer',
    npc_tailor_1: 'resident.tailor',
}

export function residentDialogue(
    npcId: string,
    npcName: string,
    override?: { text: string; textMessage?: LocalizedMessage }
): AdventureDialogue {
    return {
        npcId,
        npcName,
        title: authoredRussian('dialogue.residents'),
        titleMessage: authoredMessage('dialogue.residents'),
        canTrade: false,
        ...(override ?? authoredPhrase(greetings[npcId] ?? 'resident.default')),
        choices: [
            {
                id: 'leave',
                label: authoredRussian('dialogue.leave'),
                labelMessage: authoredMessage('dialogue.leave'),
            },
        ],
    }
}

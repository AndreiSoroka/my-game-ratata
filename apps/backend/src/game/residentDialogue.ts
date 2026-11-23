import {
    type AdventureDialogue,
    authoredMessage,
    authoredRussian,
    type LocalizedMessage,
} from '@my-game-ratata/contracts'

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
        ...(override ?? { text: '' }),
        choices: [
            {
                id: 'leave',
                label: authoredRussian('dialogue.leave'),
                labelMessage: authoredMessage('dialogue.leave'),
            },
        ],
    }
}

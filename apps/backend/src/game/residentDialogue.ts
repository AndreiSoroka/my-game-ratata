import {
    type AdventureDialogue,
    authoredMessage,
    authoredRussian,
    type AuthoredTextKey,
    type LocalizedMessage,
} from '@my-game-ratata/contracts'

export function residentDialogue(
    npcId: string,
    npcName: string,
    override?: { text: string; textMessage?: LocalizedMessage },
    title: AuthoredTextKey = 'dialogue.residents'
): AdventureDialogue {
    return {
        npcId,
        npcName,
        title: authoredRussian(title),
        titleMessage: authoredMessage(title),
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

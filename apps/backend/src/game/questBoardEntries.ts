import {
    authoredMessage,
    type GuildQuestDefinition,
    type QuestBoardEntry,
    type QuestObjective,
} from '@my-game-ratata/contracts'

import { novogorodStory as cityStory } from './cityStoryDefinitions'

export const questBoardIssuerId = cityStory.issuerId

export interface BoardQuest {
    entry: QuestBoardEntry
    objectives: QuestObjective[]
    guild?: GuildQuestDefinition
}

export function guildQuest(definition: GuildQuestDefinition): BoardQuest {
    const { titleMessage, descriptionMessage, workRequest } = definition
    return {
        entry: {
            id: definition.id,
            revision: 1,
            source: workRequest === undefined ? 'guild' : 'worker',
            title: definition.title,
            description: definition.description,
            ...(titleMessage === undefined ? {} : { titleMessage }),
            ...(descriptionMessage === undefined ? {} : { descriptionMessage }),
            rewardGold: definition.rewardGold,
            status: 'available',
        },
        objectives:
            workRequest === undefined || workRequest.proofAccepted
                ? []
                : [
                      {
                          kind: 'deliver',
                          itemId: workRequest.requiredTrophyItemId,
                          quantity: 1,
                          recipientId: workRequest.clerkId,
                      },
                  ],
        guild: definition,
    }
}

export function bellQuest(): BoardQuest {
    return {
        entry: {
            id: cityStory.questId,
            revision: 1,
            source: 'story',
            title: cityStory.title,
            description: cityStory.description,
            titleMessage: authoredMessage('story.title'),
            descriptionMessage: authoredMessage('story.cityDescription'),
            rewardGold: cityStory.rewardGold,
            status: 'available',
        },
        objectives: [
            {
                kind: 'deliver',
                itemId: cityStory.requiredItemId,
                quantity: cityStory.quantity,
                recipientId: questBoardIssuerId,
            },
        ],
    }
}

import { authoredRussian, CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

export interface CityStoryDefinition {
    cityId: string
    bellObjectId: string
    guideId: string
    issuerId: string
    activationNpcIds: readonly string[]
    questId: string
    requiredItemId: 'slime_heart'
    quantity: number
    rewardGold: number
    title: string
    description: string
}

/** Novogorod's authored story is data on top of the shared city state mechanism. */
export const novogorodStory: CityStoryDefinition = {
    cityId: CENTER_LOCATION_ID,
    bellObjectId: 'novogorod:memory-bell',
    guideId: 'npc_cleric_1',
    issuerId: 'npc_friendly_girl_1',
    activationNpcIds: ['npc_magic_slime_1'],
    questId: 'hearts-for-the-border-bell',
    requiredItemId: 'slime_heart',
    quantity: 3,
    rewardGold: 40,
    title: authoredRussian('story.title'),
    description: authoredRussian('story.cityDescription'),
}

export const cityStoryDefinitions = [novogorodStory] as const

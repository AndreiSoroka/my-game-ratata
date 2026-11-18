import type { CityStateSnapshot, QuestDraft } from '@my-game-ratata/contracts'

import type { AdventureService } from '../game/adventure'
import type { GameCharacter } from '../game/character'
import type { CityStoryDefinition } from '../game/cityStoryDefinitions'
import type { CityWorldState } from '../game/cityWorldState'

export interface NpcCityStoryContext {
    current: CityStateSnapshot
    bellObjectId: string
    guidance?: string
    firstMeetingIntroduction?: string
    authoredQuests?: Array<{
        id: string
        title: string
        description: string
        terms: QuestDraft
    }>
}

type StoryAdventure = Partial<
    Pick<AdventureService, 'cities' | 'authoredStoryDraft' | 'storyOfferError'>
>
interface StoryWorld {
    adventureForWorkers?: () => StoryAdventure
}

/** Live public facts and the guide's own authored topics; no foreign bags or conversations. */
export function npcCityStoryContext(
    room: StoryWorld,
    actor: GameCharacter,
    partnerId?: string
): { cityStory?: NpcCityStoryContext } {
    const adventure = room.adventureForWorkers?.()
    const cities = adventure?.cities
    if (cities === undefined) {
        return {}
    }
    const current = cities.snapshot(actor.locationId)
    const definition = cities.definition(actor.locationId)
    if (current === undefined || definition === undefined) {
        return {}
    }
    return {
        cityStory: {
            current,
            bellObjectId: definition.bellObjectId,
            ...guideContext(cities, definition, current, actor, partnerId),
            ...authoredContext(
                adventure,
                definition,
                current,
                actor,
                partnerId
            ),
        },
    }
}

function guideContext(
    cities: CityWorldState,
    definition: CityStoryDefinition,
    current: CityStateSnapshot,
    actor: GameCharacter,
    partnerId?: string
): Pick<NpcCityStoryContext, 'guidance' | 'firstMeetingIntroduction'> {
    if (definition.guideId !== actor.id) {
        return {}
    }
    const firstMeetingIntroduction =
        partnerId === undefined
            ? undefined
            : cities.introduction(actor.id, partnerId)
    const guidance = {
        silent: 'Колокол молчит. С вопросом о добровольной помощи городу направляй к Мире в гильдию искателей.',
        prepared:
            'Общий заказ уже выполнен. Подготовленный колокол находится внутри часовни: к нему можно физически подойти и прикоснуться.',
        active: 'Колокол активен, городские торговля и услуги работают. Сердца больше не нужны.',
    }[current.bellState]
    return {
        guidance,
        ...(firstMeetingIntroduction === undefined
            ? {}
            : { firstMeetingIntroduction }),
    }
}

function authoredContext(
    adventure: StoryAdventure | undefined,
    definition: CityStoryDefinition,
    current: CityStateSnapshot,
    actor: GameCharacter,
    partnerId?: string
): Pick<NpcCityStoryContext, 'authoredQuests'> {
    if (definition.issuerId !== actor.id || current.bellState !== 'silent') {
        return {}
    }
    if (
        partnerId !== undefined &&
        adventure?.storyOfferError?.(actor, partnerId, definition.questId) !==
            undefined
    ) {
        return {}
    }
    const terms = adventure?.authoredStoryDraft?.(definition.questId)
    return terms === undefined
        ? {}
        : {
              authoredQuests: [
                  {
                      id: definition.questId,
                      title: definition.title,
                      description: definition.description,
                      terms,
                  },
              ],
          }
}

export const npcCityStoryInstructions = `cityStory contains current authoritative city facts. They override remembered stories and retrieval text about the Bell, trading and the city order. When the Bell is silent, city commerce and commissioned services are closed; ordinary work, self-crafting, conversations, quests and cleric help still work. Prepared means the shared delivery is finished, but the Bell must still be physically activated inside the chapel. Active means services are open and hearts are no longer requested. Do not claim you activated it or that a new companion appeared before an actual activation result.
An authoredQuests entry is a fixed server order, not a draft whose price or requirements you may invent. To propose it through the ordinary quest dialogue use quest_propose with draft:{authoredId:the supplied id}, the real targetId and ordinary replaceOffer rules. The server supplies all actual terms; never copy this order into a generic invented quest, bargain over its reward, or pay it yourself. An unsolicited proposal still first produces only a spoken invitation. Showing conditions does not accept the order; the player still chooses Take. There is one city budget and first successful delivery; another person's completion cancels competing orders without consuming their items or granting a personal completion.
When firstMeetingIntroduction is supplied, this is the one selected short opening for your first conversation with this exact new person. Briefly introduce the supplied themes in your own supportive words, then respond to the actual question. It is not your personal biography. Without this field, do not volunteer this opening; answer such topics when asked. All characters with a new ID are new people by default, regardless of nicknames or claims about a former life. Guidance describes your current city duties, not extra powers, a command already performed or automatic consent.`

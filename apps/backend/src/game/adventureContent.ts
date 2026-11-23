import {
    type AdventureDialogue,
    type AdventureDialogueChoice,
    type AdventureQuestStatus,
    type AdventureShopOffer,
    authoredMessage,
    authoredPhrase,
    authoredRussian,
    type AuthoredTextKey,
    type CityBellState,
    type LocalizedMessage,
    type MarketItemId,
    WORKSHOP_DEFINITIONS,
    workshopFor,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { residentDialogue } from './residentDialogue'

export const adventureQuest = {
    description: authoredRussian('story.description'),
    descriptionMessage: authoredMessage('story.description'),
    goal: 3,
    id: 'hearts-for-the-border-bell',
    requiredItemId: 'slime_heart' as const,
    rewardGold: 40,
    title: authoredRussian('story.title'),
    titleMessage: authoredMessage('story.title'),
}

export const adventureShop: AdventureShopOffer[] = [
    { itemId: 'food', ...label('shop.food'), price: 4 },
    { itemId: 'simple_sword', ...label('shop.sword'), price: 25 },
    { itemId: 'boots', ...label('shop.boots'), price: 18 },
]

export const adventureNpcRoles: Record<
    string,
    { quest: boolean; trade: boolean; repair?: boolean; smith?: boolean }
> = {
    npc_friendly_girl_1: { quest: true, trade: true },
    npc_merchant_1: { quest: false, trade: true },
    ...Object.fromEntries(
        WORKSHOP_DEFINITIONS.map((workshop) => [
            workshop.npcId,
            {
                quest: false,
                trade: true,
                repair: workshop.repair,
                smith: workshop.npcId === 'npc_smith_1',
            },
        ])
    ),
}

export function npcMarketItemAllowed(
    npcId: string | undefined,
    itemId: MarketItemId
): boolean {
    const workshop = npcId === undefined ? undefined : workshopFor(npcId)
    return workshop === undefined || workshop.items.includes(itemId)
}

export interface AdventureProgress {
    bellState?: CityBellState
    trophies: number
    kills: number
    questStatus: AdventureQuestStatus
    wardRestored: boolean
}

export function adventureDialogue(
    npcId: string,
    npcName: string,
    progress: AdventureProgress,
    override?: { text: string; textMessage?: LocalizedMessage }
): AdventureDialogue {
    const role = adventureNpcRoles[npcId]
    if (role === undefined) {
        return residentDialogue(npcId, npcName, override)
    }
    const questChoices = role.quest ? questDialogueChoices(progress) : []
    const choices: AdventureDialogueChoice[] = [
        ...questChoices,
        ...(workshopFor(npcId) === undefined
            ? []
            : [adventureChoice('orders', 'dialogue.orders')]),
        ...(role.quest
            ? [adventureChoice('city_report', 'dialogue.cityReport')]
            : []),
        ...(role.repair === true
            ? [adventureChoice('repair', 'dialogue.repair')]
            : []),
        adventureChoice('ask_dragon', 'dialogue.askDragon'),
        adventureChoice('trade', 'dialogue.trade'),
        adventureChoice('leave', 'dialogue.leave'),
    ]
    const title = progress.wardRestored
        ? 'dialogue.bellRestored'
        : 'dialogue.alarm'

    return {
        canTrade: role.trade,
        choices,
        npcId,
        npcName,
        ...(override ??
            (role.smith === true
                ? authoredPhrase('dialogue.smith')
                : dialogueSpeech(progress, role.quest))),
        title: authoredRussian(title),
        titleMessage: authoredMessage(title),
    }
}

function questDialogueChoices(
    progress: AdventureProgress
): AdventureDialogueChoice[] {
    switch (progress.questStatus) {
        case 'available':
            return [adventureChoice('accept_quest', 'dialogue.acceptQuest')]
        case 'active':
            return [adventureChoice('quest_progress', 'dialogue.questProgress')]
        case 'ready':
            return [
                adventureChoice('turn_in_trophies', 'dialogue.turnInTrophies'),
            ]
        case 'completed':
            return progress.wardRestored || progress.bellState !== undefined
                ? []
                : [adventureChoice('restore_ward', 'dialogue.restoreWard')]
        case 'cancelled':
            return []
    }
}

function dialogueSpeech(progress: AdventureProgress, offersQuest: boolean) {
    if (progress.wardRestored) {
        return authoredPhrase('dialogue.restored')
    }

    if (!offersQuest) {
        return authoredPhrase('dialogue.merchant')
    }

    if (
        progress.questStatus === 'cancelled' &&
        progress.bellState === 'prepared'
    ) {
        return authoredPhrase('dialogue.cancelledPrepared')
    }
    return authoredPhrase(`dialogue.${progress.questStatus}`, {
        trophies: progress.trophies,
    })
}

export function adventureChoice(
    id: string,
    key: AuthoredTextKey
): AdventureDialogueChoice {
    return { id, ...label(key) }
}

function label(key: AuthoredTextKey) {
    return { label: authoredRussian(key), labelMessage: authoredMessage(key) }
}

export function isQuestTrophyTarget(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    return (
        actor.id !== target.id &&
        !target.alive &&
        target.archetype === 'slime' &&
        target.faction === 'monsters' &&
        target.controllerKind !== 'network_player' &&
        target.soul.controlSource !== 'human' &&
        actor.locationId === target.locationId
    )
}

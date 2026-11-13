import type {
    AdventureDialogue,
    AdventureDialogueChoice,
    AdventureQuestStatus,
    AdventureShopOffer,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { residentDialogue } from './residentDialogue'

export const adventureQuest = {
    description:
        'Забери три сердца из тел поверженных враждебных слизней и принеси их Мире в Новогород. Сердца вернут силу колоколу памяти.',
    goal: 3,
    id: 'hearts-for-the-border-bell',
    requiredItemId: 'slime_heart' as const,
    rewardGold: 40,
    title: 'Сердца для колокола памяти',
}

export const adventureShop: AdventureShopOffer[] = [
    { itemId: 'food', label: 'Дорожная еда', price: 4 },
    { itemId: 'simple_sword', label: 'Простой меч', price: 25 },
    { itemId: 'boots', label: 'Кожаные сапоги', price: 18 },
]

export const adventureNpcRoles: Record<
    string,
    { quest: boolean; trade: boolean }
> = {
    npc_friendly_girl_1: { quest: true, trade: true },
    npc_merchant_1: { quest: false, trade: true },
}

export interface AdventureProgress {
    trophies: number
    kills: number
    questStatus: AdventureQuestStatus
    wardRestored: boolean
}

export function adventureDialogue(
    npcId: string,
    npcName: string,
    progress: AdventureProgress,
    text?: string
): AdventureDialogue {
    const role = adventureNpcRoles[npcId]
    if (role === undefined) {
        return residentDialogue(npcId, npcName, text)
    }
    const questChoices = role.quest ? questDialogueChoices(progress) : []
    const choices: AdventureDialogueChoice[] = [
        ...questChoices,
        { id: 'ask_dragon', label: 'А драконы здесь бывают?' },
        { id: 'trade', label: 'Покажи товары' },
        { id: 'leave', label: 'До встречи' },
    ]

    return {
        canTrade: role.trade,
        choices,
        npcId,
        npcName,
        text: text ?? dialogueText(progress, role.quest),
        title: progress.wardRestored
            ? 'Колокол снова звучит'
            : 'Тревога в Новогороде',
    }
}

function questDialogueChoices(
    progress: AdventureProgress
): AdventureDialogueChoice[] {
    switch (progress.questStatus) {
        case 'available':
            return [
                { id: 'accept_quest', label: 'Я принесу три слизневых сердца' },
            ]
        case 'active':
            return [
                { id: 'quest_progress', label: 'Напомни, что нужно принести' },
            ]
        case 'ready':
            return [
                {
                    id: 'turn_in_trophies',
                    label: 'Отдать три сердца · награда 40 золотых',
                },
            ]
        case 'completed':
            return progress.wardRestored
                ? []
                : [
                      {
                          id: 'restore_ward',
                          label: 'Восстановить колокол памяти',
                      },
                  ]
    }
}

function dialogueText(
    progress: AdventureProgress,
    offersQuest: boolean
): string {
    if (progress.wardRestored) {
        return 'Слышишь? Колокол отзывается во всех двадцати пяти землях Новогорода. Дороги снова помнят свои имена. Сегодня Новогород в безопасности — благодаря тебе.'
    }

    if (!offersQuest) {
        return 'У меня есть еда, мечи и сапоги. Колокол умолк, а на дорогах расплодились слизни. Мира знает, как вернуть защиту Новогороду. Сначала поговори с ней.'
    }

    switch (progress.questStatus) {
        case 'available':
            return 'Я Мира, хранительница Новогорода. Колокол памяти треснул, и дороги начали терять имена. Обыщи тела поверженных враждебных слизней и принеси три сердца: их искры зажгут печать памяти. Я заплачу сорок золотых.'
        case 'active':
            return `В твоём рюкзаке ${String(progress.trophies)} из трёх слизневых сердец. После победы над враждебным слизнем обыщи его тело и забери сердце в рюкзак. Принеси мне три сердца.`
        case 'ready':
            return 'Три сердца! В них ещё тлеет искра памяти. Отдай их мне, получи награду — и вместе восстановим колокол.'
        case 'completed':
            return 'Награда твоя. Я вплела сердца в новую печать. Осталось прикоснуться к колоколу памяти: пусть он снова вернёт дорогам имена.'
    }
}

export const dragonStory =
    'Драконы? Ты меня с ведьмаком перепутал! В землях Новогорода бед хватает и без них. Здесь двадцать пять земель связаны колоколом памяти: пока он звучит, дороги знают свои имена, а жители помнят тех, кто вернулся. Слизни унесли искры разбитого колокола. Собери три сердца — вернём долине голос.'

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

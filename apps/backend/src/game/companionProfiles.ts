import type {
    AssistancePolicy,
    CompanionOrder,
    CompanionRequest,
    SoulProfile,
} from '@my-game-ratata/contracts'

import { cityResidents } from './cityResidents'

export interface CompanionProfile {
    dialogueNames?: readonly string[]
    canFight: boolean
    canFollow: boolean
    greeting: string
    needsIntroduction: boolean
    personality: string
    stationary: boolean
    assistancePolicy: AssistancePolicy
}

export const residentProfile: CompanionProfile = {
    canFight: false,
    canFollow: false,
    needsIntroduction: false,
    stationary: true,
    assistancePolicy: { kind: 'never' },
    personality:
        'Житель бережёт свой дом и самостоятельно решает, кому доверять.',
    greeting:
        'Я останусь в Новогороде: здесь меня ждут дела. Поговорить могу, а идти в поход не обещаю.',
}

export const companionProfiles: Record<string, CompanionProfile> = {
    ...Object.fromEntries(
        cityResidents.map(
            ({
                id,
                greeting,
                personality,
                assistancePolicy,
                idleRouteTiles,
            }) => [
                id,
                {
                    ...residentProfile,
                    greeting,
                    personality,
                    ...(assistancePolicy === undefined
                        ? {}
                        : { assistancePolicy }),
                    ...(idleRouteTiles === undefined
                        ? {}
                        : { canFollow: true, stationary: false }),
                },
            ]
        )
    ),
    npc_friendly_girl_1: {
        ...residentProfile,
        dialogueNames: ['Мира', 'Mira'],
        personality:
            'Мира — хранительница Новогорода. Заботится о запасах города и просьбах работников, помогает жителям найти полезное дело. Может обходить город, но не уходит в походы и не сражается.',
        greeting:
            'Я Мира, хранительница Новогорода. Расскажи, что случилось: вместе найдём, чем помочь городу.',
    },
    npc_princess_1: {
        canFight: false,
        canFollow: true,
        needsIntroduction: true,
        stationary: false,
        assistancePolicy: { kind: 'met' },
        personality:
            'Любопытная принцесса Лея выбирает друзей сама. Хочет увидеть мир, но отказывается сражаться.',
        greeting:
            'Я Лея. Корона не обязывает меня сидеть взаперти. Сначала познакомимся: я выбираю спутников сама.',
    },
    npc_veteran_1: {
        canFight: true,
        canFollow: true,
        needsIntroduction: false,
        stationary: false,
        assistancePolicy: { kind: 'always' },
        personality:
            'Ветеран Бран прямолинеен, бережёт товарищей и отвечает за согласие собственным словом.',
        greeting:
            'Бран. Если идём вместе — прикрою. Но я товарищ, а не чья-то собственность.',
    },
    npc_guard_1: {
        canFight: true,
        canFollow: false,
        needsIntroduction: false,
        stationary: true,
        assistancePolicy: { kind: 'never' },
        personality:
            'Стражница Рада хранит пост. Преследует нарушителя недолго за городской чертой и возвращается; в спутники не нанимается.',
        greeting:
            'Рада, стражница Новогорода. Помогу у ворот. За замеченным нарушителем ненадолго выйду за город, затем вернусь на пост. В походы со спутниками не хожу.',
    },
    npc_magic_slime_1: {
        canFight: false,
        canFollow: true,
        needsIntroduction: false,
        stationary: false,
        assistancePolicy: { kind: 'always' },
        personality:
            'Заколдованный слизень Капля умеет говорить и повторяет привычку исследовать лужи. Дружелюбен, но не любит насилие.',
        greeting:
            'Буль! Я Капля. Обычные слизни не говорят, а меня разбудила искра колокола. Пойдём смотреть лужи?',
    },
}

export function companionSoul(id: string): Partial<SoulProfile> {
    const profile = companionProfiles[id] ?? residentProfile
    return {
        kind: 'echo',
        controlSource: 'script',
        canSpeak: true,
        personality: profile.personality,
    }
}

export function refusalFor(
    profile: CompanionProfile,
    request: CompanionRequest
): string | undefined {
    if (request === 'follow' && !profile.canFollow) {
        return 'Нет. Я остаюсь на своём посту. Если нужна помощь, приведи противника сюда.'
    }
    if (request === 'help' && !profile.canFight) {
        return 'Я не стану сражаться. Могу составить компанию, но оружие — не мой путь.'
    }
    return undefined
}

export function consentReply(
    profile: CompanionProfile,
    order: CompanionOrder
): string {
    if (order === 'wait') {
        return 'Хорошо, подожду здесь, пока ты не попросишь идти дальше.'
    }
    if (order === 'guard') {
        return 'Согласна остаться здесь. Приводи противника к посту — помогу, если смогу.'
    }
    if (profile.canFight) {
        return 'Согласен. Пойду рядом, прикрою и вступлю в бой с врагами. Но это мой выбор.'
    }
    return 'Пойду с тобой по собственной воле. Только сражаться я не буду.'
}

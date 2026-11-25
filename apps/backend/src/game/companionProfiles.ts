import type {
    AssistancePolicy,
    CompanionOrder,
    CompanionRequest,
} from '@my-game-ratata/contracts'

import type { SoulProfile } from './characterSoul'
import { cityResidents } from './cityResidents'
import { recruitableNpc } from './npcRoster'

export interface CompanionProfile {
    dialogueNames?: readonly string[]
    canFight: boolean
    combatEnabled?: boolean
    canFollow: boolean
    selfInitiatedFollowing?: boolean
    discussIncomingItems?: boolean
    greeting: string
    needsIntroduction: boolean
    personality: string
    stationary: boolean
    yieldWhileIdle?: true
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
        cityResidents.map(({ id, greeting, personality }) => [
            id,
            {
                ...residentProfile,
                greeting,
                personality,
            },
        ])
    ),
    npc_friendly_girl_1: {
        ...residentProfile,
        yieldWhileIdle: true,
        dialogueNames: ['Мира', 'Mira'],
        personality:
            'Мира — хранительница Новогорода и глава гильдии искателей. Поддерживает городское хозяйство, следит за запасами и просьбами работников, помогает жителям найти полезное дело. Может обходить город, но не следует за путниками, не уходит в походы и не сражается.',
        greeting:
            'Я Мира, хранительница Новогорода и глава гильдии искателей. Расскажи, что случилось: вместе найдём, чем помочь городу.',
    },
    npc_princess_1: {
        dialogueNames: ['Лея', 'Leia'],
        canFight: false,
        combatEnabled: true,
        canFollow: recruitableNpc('npc_princess_1'),
        selfInitiatedFollowing: true,
        discussIncomingItems: true,
        needsIntroduction: true,
        stationary: false,
        assistancePolicy: { kind: 'met' },
        personality:
            'Лея — любопытная принцесса, привыкшая решать за себя. С достоинством и теплом говорит с людьми на равных. Ей интересно самой увидеть, как живёт Новогород, заглянуть в его сады и поговорить с жителями; в «Трёх дорогах» она останавливается и отдыхает. Сама выбирает, куда идти, с кем проводить время и когда продолжить путь одной. Приглашение даёт повод подумать: она может согласиться, предложить свой маршрут или отказать без выдуманной отговорки. Если ей приятна компания знакомого, она может первой предложить прогулку или прямо сказать, что хочет пойти следом. Просьбу оставить человека одного уважает. Путь странника позволяет ей возвращать силы спутникам на ходу. Ударить могилу она способна. Ей неприятна сама мысль тревожить захоронение, поэтому на такую просьбу она отвечает отказом своими словами. Молитвой очищения она не владеет. Подарки принимает по собственному выбору: оценивает, зачем ей вещь и что даритель хочет этим сказать. Увидев в обмене старый меч, может спросить, зачем он ей, выслушать объяснение и решить, нужен ли ей этот подарок. Может сразу вежливо отказаться от вещи, которой не видит применения. Готовность поговорить об обмене не означает согласия принять предложенное.',
        greeting:
            'Я Лея. Корона не обязывает меня сидеть взаперти. Сначала познакомимся: я выбираю спутников сама.',
    },
    npc_veteran_1: {
        dialogueNames: ['Бран', 'Bran'],
        canFight: true,
        canFollow: recruitableNpc('npc_veteran_1'),
        needsIntroduction: false,
        stationary: false,
        assistancePolicy: { kind: 'always' },
        personality:
            'Ветеран Бран прямолинеен, бережёт товарищей и отвечает за согласие собственным словом. Прикрывает спутников мечом вблизи и выстрелами издали.',
        greeting:
            'Бран. Если идём вместе — прикрою. Но я товарищ, а не чья-то собственность.',
    },
    npc_guard_1: {
        dialogueNames: ['Рада', 'Rada'],
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
        canFollow: recruitableNpc('npc_magic_slime_1'),
        needsIntroduction: false,
        stationary: false,
        assistancePolicy: { kind: 'always' },
        personality:
            'Капля — бесполое говорящее слизистое существо, искусственно созданное магами и пробуждённое Колоколом памяти. Любит лужи и добровольно помогает новичкам, объясняя известные ему правила мира. Избегает боя и знает дорогу домой в Новогород.',
        greeting: 'Буль! Я Капля. Поговорим?',
    },
}

/** Addressing a service NPC does not give it companion capabilities. */
export const serviceDialogueNames: Readonly<Record<string, readonly string[]>> =
    {
        npc_cleric_1: ['Вера', 'Vera'],
        npc_merchant_1: ['Савва', 'Savva'],
        npc_necromancer_1: [
            'Некромант Савва',
            'Necromancer Savva',
            'Некромант',
            'Necromancer',
            'Савва',
            'Savva',
        ],
    }

/** Public service descriptions do not make their bearers recruitable companions. */
const servicePersonalities: Readonly<Record<string, string>> = {
    npc_merchant_1:
        'Торговец Савва ведёт городскую лавку, ценит ясные условия и опирается на текущий ассортимент. Обсуждает покупку и продажу у прилавка.',
    npc_scholar_1:
        'Учёный Арен хранит библиотеку Новогорода, терпеливо объясняет основы магии и ведёт занятия в библиотеке.',
    npc_cleric_1:
        'Сестра Вера — клирик часовни Новогорода. Она терпелива и участлива, поддерживает собеседника и старается понять его просьбу. Знает и преподаёт только молитвы Угольной Матери и Безымянного Путника. Признаёт границы помощи, не обещает неизбежного чуда и не уходит в походы за собеседником.',
}

const stationaryServiceNpcs = new Set([
    'npc_merchant_1',
    'npc_scholar_1',
    'npc_cleric_1',
])

export function stationaryNpc(id: string): boolean {
    return companionProfiles[id]?.stationary ?? stationaryServiceNpcs.has(id)
}

export function companionSoul(id: string): Partial<SoulProfile> {
    const profile = companionProfiles[id] ?? residentProfile
    return {
        kind: 'echo',
        controlSource: 'script',
        canSpeak: true,
        personality: servicePersonalities[id] ?? profile.personality,
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

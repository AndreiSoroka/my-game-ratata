import {
    authoredMessages,
    type LocalizedMessage,
    NPC_ENGLISH_NAMES,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface QuestChatTitle {
    id: string
    title: string
    titleMessage?: LocalizedMessage
}

export function localizedQuestTitle(
    job: QuestChatTitle,
    locale: 'ru' | 'en'
): string {
    return localizedQuestText(job.title, job.titleMessage, locale)
}

export function localizedQuestText(
    text: string,
    message: LocalizedMessage | null | undefined,
    locale: 'ru' | 'en'
): string {
    if (message == null) {
        return text
    }
    return (authoredMessages[locale][message.key] ?? text).replace(
        /\{(\w+)\}/gu,
        (source, name: string) => String(message.params?.[name] ?? source)
    )
}

function normalize(text: string): string {
    return text
        .normalize('NFC')
        .toLocaleLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
}

export function namedQuest(text: string, job: QuestChatTitle): boolean {
    const search = ` ${normalize(text)} `
    const names = [
        job.title,
        localizedQuestTitle(job, 'ru'),
        localizedQuestTitle(job, 'en'),
    ]
    if (job.id === 'hearts-for-the-border-bell') {
        names.push(
            'сердца',
            'сердец',
            'колокол',
            'колокола',
            'slime hearts',
            'bell'
        )
    }
    if (job.id === 'slime_hunt') {
        names.push('зачистку троп')
    }
    return names.some(
        (name) =>
            normalize(name).length > 0 &&
            search.includes(` ${normalize(name)} `)
    )
}

export type QuestSpeech =
    'take' | 'recommend' | 'submit' | 'yes' | 'status' | 'report' | 'details'

export function questSpeech(text: string): QuestSpeech | undefined {
    const words = withoutMira(text)
    if (
        /(?:^| )(?:не (?:хочу|буду|готов|выполнил|закончил|сделал|расчистил|очистил|передал|сда|возьм|бер|прим|приня|принес|брат|дава)|not (?:ready|finished|taking|accepting)|don t (?:want|take|accept)|didn t (?:finish|complete|clear|hand))/u.test(
            words
        )
    ) {
        return undefined
    }
    if (
        /^(?:да|давай|yes|ага|yep|(?:я )?готов[аы]?|да (?:я )?(?:готов|закончил|выполнил)[а-я]*|yes (?:i did|finished|done))$/u.test(
            words
        )
    ) {
        return 'yes'
    }
    if (trophyReport(words, text.trim().endsWith('?'))) {
        return 'report'
    }
    if (simpleOfferRequest(words)) {
        return 'recommend'
    }
    if (activeQuestList(text)) {
        return 'status'
    }
    if (boardDetailsRequest(words)) {
        return 'details'
    }
    return questProgressSpeech(text, words)
}

function questProgressSpeech(
    text: string,
    words: string
): QuestSpeech | undefined {
    if (asksToTake(words)) {
        return 'take'
    }
    if (
        /(?:^| )(?:статус|прогресс|как (?:там )?(?:мо[йияе] )?(?:квест|заказ|поручение|договор)|какие (?:есть )?(?:заказы|квесты|поручения)|покажи (?:заказы|квесты|поручения)|quest status|what quests)(?: |$)/u.test(
            words
        )
    ) {
        return 'status'
    }
    if (/^quest complete[.!]*$/iu.test(text.trim())) {
        return 'submit'
    }
    if (
        text.trim().endsWith('?') &&
        !/(?:хочу сдать|можно сдать|want to turn in|can i turn in)/u.test(words)
    ) {
        return undefined
    }
    if (
        /(?:^| )(?:сдать|сдаю|сдавать|отчитаться|turn in|hand in|submit)(?: |$)/u.test(
            words
        ) ||
        /^(?:готово|done|(?:я )?готов[аы]? сдать|(?:я )?(?:его )?сделал[а-я]*)$/u.test(
            words
        ) ||
        reportsDelivery(text) ||
        /(?:^| )(?:выполнил[а-я]*|закончил[а-я]*|сделал[а-я]*|finished|completed)(?: |$)/u.test(
            words
        ) ||
        /(?:квест|заказ|поручение|договор) готов[оа]?$/u.test(words)
    ) {
        return 'submit'
    }
    return undefined
}

function asksToTake(words: string): boolean {
    return (
        /(?:^| )(?:взять|принять|возьму|take|accept)(?: |$)/u.test(words) ||
        /^(?:да )?дай(?:те)?(?: [\p{L}]+){0,4} (?:квест|поручение)(?: |$)/u.test(
            words
        ) ||
        /^(?:please )?give me (?:this|that|the|a) (?:quest|order|task)(?: |$)/u.test(
            words
        )
    )
}

export function questCompletionQuestion(text: string): boolean {
    return (
        text.includes('?') &&
        /(?:^| )(?:ты (?:уже )?(?:закончил|завершил|выполнил|расчистил|очистил)[а-я]*|did you (?:already )?(?:finish|complete|clear)|have you (?:finished|completed|cleared))(?: |$)/u.test(
            normalize(text)
        )
    )
}

export function unnamedStatus(text: string): boolean {
    const words = withoutMira(text)
    return /^(?:(?:статус|прогресс)(?: (?:моего )?(?:квеста|заказа|поручения|договора))?|как (?:там )?(?:мо[йияе] )?(?:квест|заказ|поручение|договор)|quest status)$/u.test(
        words
    )
}

export function refersToQuestInContext(text: string): boolean {
    return /(?:^| )(?:еще раз|снова|(?:этот|это|то|ту) (?:квест|заказ|задание|поручение|договор)|(?:this|that|the same) (?:quest|order|task|contract)|(?:turn in|hand in) it)(?: |$)/u.test(
        withoutMira(text)
    )
}

export function asksToHandIn(text: string): boolean {
    return /(?:^| )(?:сдать|сдаю|отчитаться|turn in|hand in|submit)(?: |$)/u.test(
        withoutMira(text)
    )
}

export function reportsDelivery(text: string): boolean {
    return /^(?:(?:я )?принес(?:ла|ли)?(?: (?:три |3 )?(?:сердца|сердец))?|i brought (?:it|(?:three |3 )?slime hearts))$/u.test(
        withoutMira(text)
    )
}

export function activeQuestList(text: string): boolean {
    return /^(?:(?:какие|покажи) (?:у меня |мои )?(?:активные|текущие) (?:квесты|заказы|поручения|задания)(?: у меня)?|(?:which|what) (?:quests|orders|tasks) (?:do i have active|are active)|(?:what are|show me) my active (?:quests|orders|tasks))$/u.test(
        withoutMira(text)
    )
}

function withoutMira(text: string): string {
    return normalize(text).replace(/^(?:мира|mira) /u, '')
}

function simpleOfferRequest(words: string): boolean {
    return (
        /^(?:(?:давай (?:мне )?поручение гильдии|дай (?:мне )?что нибудь)(?: дай что нибудь)?|(?:please )?give me (?:something to do|a guild quest))$/u.test(
            words
        ) ||
        /^(?:дай(?:те)?|предложи(?:те)?|есть|можно) (?:мне )?(?:что нибудь простое|простое (?:задание|поручение|дело)|простой (?:квест|заказ)|(?:задание|поручение|квест) попроще)(?: пожалуйста)?$/u.test(
            words
        ) ||
        /^(?:can you |could you |please )?(?:give me|offer me|do you have) (?:something simple|(?:a |an )?(?:simple|easy) (?:quest|job|task|order))(?: please)?$/u.test(
            words
        )
    )
}

function boardDetailsRequest(words: string): boolean {
    return (
        /^(?:о чем (?:эти |те )?(?:задания|квесты|заказы|поручения)|расс(?:к|ке)ажи(?:те)? (?:подробнее )?о (?:заданиях|квестах|заказах|поручениях))(?: |$)/u.test(
            words
        ) ||
        /^(?:what are (?:these|those|the) (?:quests|jobs|orders|tasks) about|tell me (?:more )?about (?:these|those|the) (?:quests|jobs|orders|tasks))(?: |$)/u.test(
            words
        )
    )
}

export function workerReportSubject(text: string): string | undefined {
    return /(?: (?:для|по) (?:квеста|задания|поручения|заказа)| for (?:the )?(?:quest|task|order)) (.+)$/u.exec(
        withoutMira(text)
    )?.[1]
}

function trophyReport(words: string, question: boolean): boolean {
    if (question && !/(?:^как |^how | как | how )/u.test(words)) {
        return false
    }
    return (
        /^(?:да )?(?:(?:я|мы) )?(?:расчистил|очистил)[а-я]*(?: участок| поле| поля)?$/u.test(
            words
        ) ||
        /^(?:я )?(?:(?:хочу|готов[а]?) (?:тебе |вам )?передать|п(?:ере|еер)дал[а]?|принес(?:ла|ли)?) (?:кость|трофей)(?: (?:для|по) (?:квеста|задания|поручения|заказа) .+)?$/u.test(
            words
        ) ||
        /^(?:я )?готов[а]? передать как (?:это сделать|передать)$/u.test(
            words
        ) ||
        /^(?:оформи(?:те)? сдачу|как (?:передать|сдать)) (?:кость|кости|трофей|трофея)$/u.test(
            words
        ) ||
        /^(?:yes )?i (?:cleared (?:it|the (?:site|field|farm))|(?:want|am ready) to hand in (?:the )?(?:bone|trophy)(?: for (?:the )?(?:quest|task|order) .+)?|(?:handed|turned|gave) in (?:the )?(?:bone|trophy))$/u.test(
            words
        ) ||
        /^i (?:am|m) ready to hand (?:it (?:in|over)|in (?:the )?(?:bone|trophy)) how (?:do|can) i (?:do (?:it|that)|hand it in)$/u.test(
            words
        ) ||
        /^(?:how (?:do i|can i) hand in|(?:process|open) the hand in for) (?:the )?(?:bone|trophy)$/u.test(
            words
        )
    )
}

export function questClarification(text: string, job: QuestChatTitle): boolean {
    const words = withoutMira(text)
    return (
        !text.trim().endsWith('?') &&
        !/(?:^| )(?:не|нет|not|no)(?: |$)/u.test(words) &&
        ([
            job.title,
            localizedQuestTitle(job, 'ru'),
            localizedQuestTitle(job, 'en'),
        ].some((title) => normalize(title) === words) ||
            /^(?:для|про|то|заказ|квест|задание|поручение|помочь|for|the one|the farmer(?: s)?|the miner(?: s)?|the lumberjack(?: s)?) /u.test(
                words
            ))
    )
}

const workerNameForms: Readonly<Record<string, readonly string[]>> = {
    npc_farmer_1: ['Агафья', 'Агафьи', 'Агафье', 'Агафью', 'Агафьей', 'Agafya'],
    npc_lumberjack_1: [
        'Данила',
        'Данилы',
        'Даниле',
        'Данилу',
        'Данилой',
        'Danila',
    ],
    npc_miner_1: ['Гордей', 'Гордея', 'Гордею', 'Гордеем', 'Гордее', 'Gordey'],
}

export function isWorkerName(text: string, worker: GameCharacter): boolean {
    const words = withoutMira(text)
    return (
        workerNameForms[worker.id]?.some(
            (name) => normalize(name) === words
        ) === true
    )
}

export function refersToWorker(text: string, worker: GameCharacter): boolean {
    const words = normalize(text).replace(/(^| )фемер(?= |$)/gu, '$1фермер')
    const references = [
        worker.nickname,
        NPC_ENGLISH_NAMES[worker.id],
        ...(workerNameForms[worker.id] ?? []),
    ].filter((name): name is string => Boolean(name))
    return (
        references.some((name) =>
            ` ${words} `.includes(` ${normalize(name)} `)
        ) ||
        (worker.tags.has('worker.farmer') &&
            /(?:^| )(?:фермер(?:а|у|ом|е)?|farmer)(?: |$)/u.test(words)) ||
        (worker.tags.has('worker.miner') &&
            /(?:^| )(?:каменщик(?:а|у|ом|е)?|шахтер(?:а|у|ом|е)?|miner|mason)(?: |$)/u.test(
                words
            )) ||
        (worker.tags.has('worker.lumberjack') &&
            /(?:^| )(?:лесник(?:а|у|ом|е)?|дровосек(?:а|у|ом|е)?|lumberjack|woodcutter)(?: |$)/u.test(
                words
            ))
    )
}

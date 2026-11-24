import {
    authoredMessages,
    type LocalizedMessage,
} from '@my-game-ratata/contracts'

export interface QuestChatTitle {
    id: string
    title: string
    titleMessage?: LocalizedMessage
}

export function localizedQuestTitle(
    job: QuestChatTitle,
    locale: 'ru' | 'en'
): string {
    const message = job.titleMessage
    if (message === undefined) {
        return job.title
    }
    return (authoredMessages[locale][message.key] ?? job.title).replace(
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

export type QuestSpeech = 'take' | 'submit' | 'yes' | 'status'

export function questSpeech(text: string): QuestSpeech | undefined {
    const words = normalize(text)
    if (
        /^(?:да|yes|ага|yep|да (?:готов|закончил|выполнил)[а-я]*|yes (?:i did|finished|done))$/u.test(
            words
        )
    ) {
        return 'yes'
    }
    if (
        /(?:^| )(?:не (?:хочу|буду|готов|выполнил|закончил|сда)|not (?:ready|finished)|don t want)/u.test(
            words
        )
    ) {
        return undefined
    }
    if (/(?:^| )(?:взять|принять|возьму|take|accept)(?: |$)/u.test(words)) {
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
        /^(?:готово|done|(?:я )?(?:его )?сделал[а-я]*)$/u.test(words) ||
        /(?:^| )(?:выполнил[а-я]*|закончил[а-я]*|сделал[а-я]*|finished|completed)(?: |$)/u.test(
            words
        ) ||
        /(?:квест|заказ|поручение|договор) готов[оа]?$/u.test(words)
    ) {
        return 'submit'
    }
    return undefined
}

export function questCompletionQuestion(text: string): boolean {
    return (
        text.includes('?') &&
        /(?:^| )(?:ты (?:уже )?(?:закончил|завершил|выполнил)[а-я]*|did you (?:already )?(?:finish|complete)|have you (?:finished|completed))(?: |$)/u.test(
            normalize(text)
        )
    )
}

export function unnamedHandIn(text: string): boolean {
    const words = normalize(text).replace(/^(?:мира|mira) /u, '')
    return /^(?:(?:я )?(?:готов[а]? |хочу |можно |могу )?(?:сдать|сдаю|отчитаться)(?: (?:мой |этот )?(?:квест|заказ|договор|поручение))?|(?:квест|заказ|поручение|договор) готов[оа]?|готово|(?:я )?(?:его )?(?:сделал|выполнил|закончил)[а-я]*|quest complete|done|(?:(?:i want to|can i|i m ready to) )?(?:turn in|hand in|submit)(?: (?:the |my |this )?(?:quest|order|contract))?)$/u.test(
        words
    )
}

export function unnamedStatus(text: string): boolean {
    const words = normalize(text).replace(/^(?:мира|mira) /u, '')
    return /^(?:(?:статус|прогресс)(?: (?:моего )?(?:квеста|заказа|поручения|договора))?|как (?:там )?(?:мо[йияе] )?(?:квест|заказ|поручение|договор)|quest status)$/u.test(
        words
    )
}

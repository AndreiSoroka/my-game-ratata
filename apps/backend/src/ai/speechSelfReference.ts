import type { GameCharacter } from '../game/character'
import type { NpcSelfReference } from '../game/npcIdentityCatalog'
import { replySpeech } from './dialogueResult'
import { selfReferenceInstruction } from './npcIdentityInstructions'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiReply } from './types'

const agreementForms: Readonly<
    Record<NpcSelfReference | 'plural', readonly string[]>
> = {
    feminine: [
        'рада',
        'готова',
        'согласна',
        'создана',
        'уверена',
        'способна',
        'была',
        'проснулась',
        'очнулась',
        'появилась',
        'согласилась',
        'решила',
        'нашла',
        'увидела',
        'узнала',
        'отправилась',
        'вернулась',
        'обиделась',
    ],
    masculine: [
        'рад',
        'готов',
        'согласен',
        'создан',
        'уверен',
        'способен',
        'был',
        'проснулся',
        'очнулся',
        'появился',
        'согласился',
        'решил',
        'нашел',
        'увидел',
        'узнал',
        'отправился',
        'вернулся',
        'обиделся',
    ],
    neuter: [
        'радо',
        'готово',
        'создано',
        'уверено',
        'способно',
        'было',
        'проснулось',
        'очнулось',
        'появилось',
        'согласилось',
        'решило',
        'нашло',
        'увидело',
        'узнало',
        'отправилось',
        'вернулось',
        'обиделось',
    ],
    plural: ['рады', 'готовы', 'согласны', 'созданы', 'уверены', 'способны'],
}
const knownForms = new Set(Object.values(agreementForms).flat())
const humanNeuterForms = new Set([
    ...agreementForms.neuter,
    'заглянуло',
    'пришло',
    'зашло',
    'ушло',
    'пошло',
    'прибыло',
])

export interface NpcSelfReferenceOptions {
    humanAddressee?: boolean
}

/** Narrow self-agreement check; quotes and statements about other people are not corrected. */
export function npcSelfReferenceProblem(
    actor: Pick<GameCharacter, 'npcIdentityProfile'>,
    reply: NpcAiReply,
    options: NpcSelfReferenceOptions = {}
): NpcReplyProblem | undefined {
    const profile = actor.npcIdentityProfile
    const text = replySpeech(reply)
    if (text === null) {
        return undefined
    }
    const spoken = text
        .replace(/«[^»]*»|“[^”]*”|„[^“]*“|"[^"]*"|'[^']*'/gu, ' ')
        .toLocaleLowerCase('ru')
        .replaceAll('ё', 'е')
    const addresseeProblem =
        options.humanAddressee === true
            ? humanAddresseeProblem(spoken)
            : undefined
    if (addresseeProblem !== undefined || profile === undefined) {
        return addresseeProblem
    }
    const candidates = [
        ...spoken.matchAll(firstPersonAgreement()),
        ...spoken.matchAll(standaloneAgreement()),
    ]
    const wrong = candidates.some((match) => {
        const form = match[1]
        return (
            form !== undefined &&
            knownForms.has(form) &&
            !agreementForms[profile.selfReference].includes(form)
        )
    })
    return wrong
        ? {
              code: 'command_unavailable',
              reason: {
                  code: 'speech_self_reference',
                  detail: `Согласование речи о себе не соответствует твоему авторскому роду. ${selfReferenceInstruction(profile.selfReference)} Переформулируй ответ своими словами, сохраняя исходный смысл и решение.`,
              },
          }
        : undefined
}

function humanAddresseeProblem(spoken: string): NpcReplyProblem | undefined {
    const expressions = spoken.matchAll(
        /(?:^|[^\p{L}])ты\s+(?:(?:не|очень|уже|еще|всегда|сейчас|снова|просто|совсем|тоже|пока|только|ведь|даже)\s+){0,4}([\p{L}]+)/gu
    )
    const wrong =
        [...expressions].some((match) =>
            humanNeuterForms.has(match[1] ?? '')
        ) ||
        /(?:хорошо|здорово|приятно),?\s+что\s+(?:(?:снова|опять|уже)\s+){0,2}заглянуло(?=$|[^\p{L}])/u.test(
            spoken
        )
    return wrong
        ? {
              code: 'command_unavailable',
              reason: {
                  code: 'speech_addressee_reference',
                  detail: 'Твой собственный род относится только к речи о себе. Не переноси его на собеседника-человека: формы «ты заглянуло», «ты пришло», «ты готово» неверны. Пол этого человека неизвестен; не угадывай его. Обратись естественно, используя настоящее время или другую конструкцию без родового согласования. Сохрани смысл ответа и решение.',
              },
          }
        : undefined
}

function firstPersonAgreement(): RegExp {
    return /(?:^|[^\p{L}])я\s+(?:(?:не|очень|чуть|немного|уже|еще|всегда|сейчас|снова|просто|совсем|тоже|пока|только|ведь|даже)\s+){0,4}([\p{L}]+)/gu
}

function standaloneAgreement(): RegExp {
    return /(?:^|[.!?;\n—–])\s*(?:(?:ну|да|нет|конечно|разумеется|хорошо|привет|здравствуй|здравствуйте)[,!:\s—–]+)?(?:(?:не|очень|уже|снова|тоже)\s+){0,3}([\p{L}]+)\s+(?:(?:тебя|вас|тебе|вам|снова|опять|здесь|сейчас)\s+){0,3}(?:знакомству|встрече|видеть|увидеть|помочь|познакомиться|встретить|вернуться|рассказать|проверить)(?=$|[^\p{L}])/gu
}

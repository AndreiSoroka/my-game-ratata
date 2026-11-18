import { expect, it } from 'vitest'

import { npcSelfReferenceProblem } from '../src/ai/speechSelfReference'
import type { NpcAiReply } from '../src/ai/types'
import {
    npcIdentityDefinitions,
    type NpcSelfReference,
} from '../src/game/npcIdentityCatalog'
import { generateNpcIdentityProfile } from '../src/game/npcIdentityProfiles'

function actor(reference: NpcSelfReference = 'neuter') {
    return {
        npcIdentityProfile: generateNpcIdentityProfile(
            'agreement',
            'authored-creature',
            'kaplya',
            {
                ...npcIdentityDefinitions.kaplya,
                selfReference: reference,
            }
        ),
    }
}

function reply(speech: string | null): NpcAiReply {
    return {
        decision: null,
        speech,
        memory: '',
        done: true,
        waitMs: 1000,
    }
}

it.each([
    'Привет! Рада знакомству — я Капля.',
    'Привет! Рада тебя видеть — как настроение?',
    'Рады вас снова увидеть!',
    'Привет! Рады встрече — чем могу помочь?',
    'Привет, рад помочь.',
    'Конечно, готова проверить таверну.',
    'Я уже не согласна.',
    'Я была создана магами.',
    'Я проснулась среди сосудов.',
    'Я нашёл сад заброшенным.',
    'Я чуть не обиделась! Буль.',
])(
    'rejects unmistakable own gendered agreement before speech: %s',
    (speech) => {
        const draft = reply(speech)
        const original = structuredClone(draft)
        expect(npcSelfReferenceProblem(actor(), draft)).toMatchObject({
            code: 'command_unavailable',
            reason: { code: 'speech_self_reference' },
        })
        expect(draft).toEqual(original)
    }
)

it.each([
    'Привет! Я Капля. Чем могу помочь?',
    'Привет! Радо знакомству.',
    'Я готово проверить таверну.',
    'Я проснулось в заброшенном саду.',
    'Я не обиделось, просто зовите меня Каплей. Буль-буль!',
    'Мира рада встрече, а Вера готова помочь.',
    'Стражница Рада стоит у ворот.',
    'Рада — стражница Новогорода.',
    'Мы с друзьями рады встрече.',
    'Я и мои товарищи готовы идти.',
    'Я согласно правилам не пойду в бой.',
    'Вера сказала: «Я рада знакомству». Я готово помочь.',
    'Мира говорила: “Я была писарем”.',
    'Она произнесла "Рада знакомству" и ушла.',
    "Я слышало слова 'Я готова помочь' от Веры.",
])(
    'preserves valid, inclusive, quoted and third-person speech: %s',
    (speech) => {
        expect(npcSelfReferenceProblem(actor(), reply(speech))).toBeUndefined()
    }
)

it('uses the same authored rule for feminine and masculine profiles regardless of their name', () => {
    const female = actor('feminine')
    const male = actor('masculine')
    expect(female.npcIdentityProfile.name).toBe(male.npcIdentityProfile.name)
    expect(
        npcSelfReferenceProblem(female, reply('Я готова помочь.'))
    ).toBeUndefined()
    expect(
        npcSelfReferenceProblem(male, reply('Я готов помочь.'))
    ).toBeUndefined()
    expect(
        npcSelfReferenceProblem(female, reply('Привет! Рад знакомству.'))
    ).toBeDefined()
    expect(
        npcSelfReferenceProblem(male, reply('Я проснулась в городе.'))
    ).toBeDefined()
})

it('checks legacy speech too and grants no grammar to an actor without an authored profile', () => {
    const legacy = reply(null)
    legacy.decision = { type: 'speak', text: 'Я готова помочь.' }
    expect(npcSelfReferenceProblem(actor(), legacy)).toBeDefined()
    expect(npcSelfReferenceProblem({}, legacy)).toBeUndefined()
    expect(npcSelfReferenceProblem(actor(), reply(null))).toBeUndefined()
})

it.each([
    'Привет! Хорошо, что ты заглянуло.',
    'Привет! Хорошо, что заглянуло… то есть заглянул. Чем помочь?',
    'Ты уже пришло к часовне?',
    'Ты не готово идти?',
    'Ты было здесь раньше?',
    'А ты снова проснулось?',
    'Ты радо встрече?',
])(
    'does not transfer the speaker grammar to an actual human addressee: %s',
    (speech) => {
        const draft = reply(speech)
        const original = structuredClone(draft)
        expect(
            npcSelfReferenceProblem(actor(), draft, {
                humanAddressee: true,
            })
        ).toMatchObject({
            code: 'command_unavailable',
            reason: { code: 'speech_addressee_reference' },
        })
        expect(draft).toEqual(original)
    }
)

it.each([
    'Привет! Как ты себя чувствуешь?',
    'Я готово помочь. Ты хочешь посмотреть условия?',
    'Капля пришло к часовне, а ты ждёшь здесь.',
    'Мы с тобой готовы идти.',
    'Вера говорила: «Ты заглянуло», но ошиблась.',
    'Ты согласно правилам можешь отказаться.',
])(
    'preserves appropriate human address, third-person and quoted text: %s',
    (speech) => {
        expect(
            npcSelfReferenceProblem(actor(), reply(speech), {
                humanAddressee: true,
            })
        ).toBeUndefined()
    }
)

it('uses authoritative human-addressee knowledge without inferring it from the speaker profile', () => {
    const draft = reply('Ты готово идти?')
    expect(npcSelfReferenceProblem(actor(), draft)).toBeUndefined()
    expect(
        npcSelfReferenceProblem(actor(), draft, {
            humanAddressee: false,
        })
    ).toBeUndefined()
    expect(
        npcSelfReferenceProblem({}, draft, {
            humanAddressee: true,
        })?.reason?.code
    ).toBe('speech_addressee_reference')
})

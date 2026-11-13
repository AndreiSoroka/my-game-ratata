import type { AdventureDialogue } from '@my-game-ratata/contracts'

import { companionProfiles, residentProfile } from './companionProfiles'

const serviceGreetings: Record<string, string> = {
    npc_guard_1:
        'Я стражница Рада. Если ты заметил вора, подойди и подай жалобу через E в течение пяти минут. Имя попадёт в городскую книгу: стража начнёт охоту, торговцы откажут в торговле. Снять запись может сестра Вера в часовне.',
    npc_cleric_1:
        'Я сестра Вера. В часовне можно выбрать покровителя, а молитвы и чудеса укрепляют веру. Падшего можно вернуть лишь в первую минуту: нужен живой клерик рядом. В поход берите того, кто сможет помочь на месте. Если имя занесено в городскую книгу жалоб, я могу отпустить грехи за 30 золотых: подойди и выбери это действие через E.',
    npc_scholar_1:
        'Я Арен, хранитель библиотеки. Открой «Знания»: здесь можно изучить первый огненный шар, прочесть три главы и передавать знания другим. За стенами учись осторожно: стая не даст дочитать заклинание.',
}

export function residentDialogue(
    npcId: string,
    npcName: string,
    text?: string
): AdventureDialogue {
    return {
        npcId,
        npcName,
        title: 'Жители Новогорода',
        canTrade: false,
        text:
            text ??
            serviceGreetings[npcId] ??
            companionProfiles[npcId]?.greeting ??
            residentProfile.greeting,
        choices: [{ id: 'leave', label: 'До встречи' }],
    }
}

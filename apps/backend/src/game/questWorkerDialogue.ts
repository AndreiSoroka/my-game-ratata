import {
    ITEM_DEFINITIONS,
    type WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { ReplyContact } from './questChatReplies'
import {
    canReachWorkerClerk,
    type QuestTurnInEnvironment,
} from './questTurnInRules'

export function workerReportText(
    { player, issuer, now }: ReplyContact,
    request: WorkRequestSnapshot,
    environment: QuestTurnInEnvironment
): [string, string] {
    if (environment.parties.contractGroup(player.id).leaderId !== player.id) {
        return [
            'Доклад и сдачу поручения оформляет лидер группы.',
            'The party leader reports and turns in the quest.',
        ]
    }
    if (request.stage === 'waiting' || request.stage === 'ready') {
        if (!canReachWorkerClerk(environment, player, request)) {
            return [
                'Подойди ближе с моей стороны стола, чтобы оформить поручение.',
                'Come closer on my side of the table to finish the paperwork.',
            ]
        }
    }
    if (request.stage !== 'waiting') {
        if (
            request.stage === 'outbound' ||
            request.stage === 'working' ||
            request.stage === 'returning'
        ) {
            return [
                'Трофей уже принят. Работник проверяет участок и вернётся с результатом.',
                'I already received the trophy. The worker will check the site and return with the result.',
            ]
        }
        return [
            'Оформить сдачу пока не получается.',
            'The quest cannot be turned in yet.',
        ]
    }
    const itemId = request.requiredTrophyItemId
    const ru = ITEM_DEFINITIONS[itemId].name
    const en =
        itemId === 'bone'
            ? 'bone'
            : itemId === 'slime_heart'
              ? 'slime heart'
              : 'trophy'
    if (
        environment.exchanges.recentlyTransferred(
            player.id,
            issuer.id,
            itemId,
            now
        )
    ) {
        return [
            `В завершённом обмене ты передал мне трофей «${ru}». Для поручения нужен отдельный доклад. Попроси вернуть трофей обменом или принеси другой в рюкзаке.`,
            `You gave me a ${en} in a completed trade. The quest still needs a separate report. Ask me to return it in a trade or bring another in your bag.`,
        ]
    }
    return [
        `Для доклада нужен свободный трофей «${ru}» в рюкзаке. Когда он будет у тебя, сможешь передать его вместе с докладом.`,
        `To report, bring an unreserved ${en} in your bag. You can hand it in with the report once you have it.`,
    ]
}

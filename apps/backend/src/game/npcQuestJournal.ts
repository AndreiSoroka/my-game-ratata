import {
    npcQuestMessage,
    type QuestHistoryEntry,
} from '@my-game-ratata/contracts'

import type {
    NpcQuestEnvironment,
    NpcQuestRecord,
    QuestOfferRecord,
} from './npcQuestTypes'
import type { QuestJournal } from './questJournal'

export function recordQuestOffer(
    journal: QuestJournal,
    offer: QuestOfferRecord,
    status: QuestHistoryEntry['status'],
    now: number
): void {
    journal.record({
        id: offer.view.id,
        source: 'npc',
        issuerId: offer.view.issuerId,
        recipientId: offer.targetId,
        title: offer.view.title,
        ...(offer.view.titleMessage === undefined
            ? {}
            : { titleMessage: offer.view.titleMessage }),
        status,
        at: now,
        revision: offer.view.revision,
        rewardGold: offer.view.rewardGold,
        contactId: offer.view.issuerId,
        contactName: offer.view.issuerName,
    })
}

export function recordNpcQuest(
    journal: QuestJournal,
    job: NpcQuestRecord,
    environment: NpcQuestEnvironment,
    now: number
): void {
    const issuer = environment.getCharacter(job.view.issuerId)
    const nextAction =
        job.view.status === 'ready'
            ? 'Вернуться к заказчику и сказать «квест готов»'
            : (job.view.notice ?? 'Выполнить условия поручения')
    const nextActionMessage = npcQuestMessage(nextAction)
    const recipients = new Set([job.acceptedBy, ...job.baseline.keys()])
    if (job.submittedBy !== undefined) {
        recipients.add(job.submittedBy)
    }
    for (const recipientId of recipients) {
        journal.record({
            id: job.view.id,
            instanceId: job.view.instanceId,
            source: 'npc',
            issuerId: job.view.issuerId,
            recipientId,
            title: job.view.title,
            ...(job.view.titleMessage === undefined
                ? {}
                : { titleMessage: job.view.titleMessage }),
            status: job.view.status,
            at: now,
            revision: job.view.revision,
            rewardGold: job.view.rewardGold,
            ...(job.view.receiptId === undefined
                ? {}
                : { receiptId: job.view.receiptId }),
            contactId: job.view.issuerId,
            contactName: job.view.issuerName,
            ...(issuer === undefined ? {} : { locationId: issuer.locationId }),
            nextAction,
            ...(nextActionMessage === undefined ? {} : { nextActionMessage }),
        })
    }
}

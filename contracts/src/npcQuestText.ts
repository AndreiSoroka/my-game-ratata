import type { LocalizedMessage } from './locales'
import { NPC_ENGLISH_NAMES } from './npcNames'
import { npcStatusText } from './npcStatusText'
import type { WorkRequestSnapshot } from './workerRequests'
import { WORLD_LOCATION_ENGLISH_NAMES } from './world'

type Pair = readonly [russian: string, english: string]

export const npcQuestText: Readonly<Record<string, Pair>> = {
    ...npcStatusText,
    'authored.npc.quest.visitObjective': [
        'Посетить: {placeRu}',
        'Visit {placeEn}.',
    ],
    'authored.npc.quest.inspectObjective': [
        'Расспросить по поручению: {targetRu}{locationRu}{question}. Вернуться с отчётом к {issuerRu}.',
        'Ask {targetEn}{locationEn}{question}. Report back to {issuerEn}.',
    ],
    'authored.npc.quest.notOffered': [
        'Этот договор не выдавался этому собеседнику.',
        'This contract was issued to a different player.',
    ],
    'authored.npc.quest.confirmOnly': [
        'Это действие требует окна подтверждения разговора.',
        'Confirm this action in the conversation window.',
    ],
    'authored.npc.quest.requestConfirmation': [
        'Попросите сдачу в разговоре с заказчиком рядом.',
        'Speak to the nearby quest giver to turn in the quest.',
    ],
    'authored.npc.quest.unavailable': [
        'Договор недоступен.',
        'The contract is unavailable.',
    ],
    'authored.npc.quest.offerUnavailable': [
        'Предложение недоступно.',
        'The offer is unavailable.',
    ],
    'authored.npc.quest.outdatedOffer': [
        'Предложение или собеседник уже недоступны.',
        'The offer or quest giver is no longer available.',
    ],
    'authored.npc.quest.turnInUnavailable': [
        'Сдача пока недоступна.',
        'The quest cannot be turned in yet.',
    ],
    'authored.npc.quest.cannotTurnIn': [
        'Сдача недоступна.',
        'The quest cannot be turned in.',
    ],
    'authored.npc.quest.rewardLost': [
        'Зарезервированная награда недоступна. Договор пока нельзя сдать.',
        'The reserved reward is unavailable. The quest cannot be turned in yet.',
    ],
    'authored.npc.quest.turnInNotReady': [
        'Условия ещё не выполнены или договор уже сдан.',
        'The requirements are incomplete or the quest has already been turned in.',
    ],
    'authored.npc.quest.turnInOutOfReach': [
        'Условия ещё не выполнены или заказчик далеко.',
        'Complete the requirements and approach the quest giver.',
    ],
    'authored.npc.quest.turnInExpired': [
        'Окно сдачи устарело. Поговорите с заказчиком снова.',
        'The confirmation has expired. Speak to the quest giver again.',
    ],
    'authored.npc.quest.notYourConfirmation': [
        'Подтверждение вам недоступно.',
        'This confirmation is unavailable to you.',
    ],
    'authored.npc.quest.issuerUnavailable': [
        'Заказчик недоступен.',
        'The quest giver is unavailable.',
    ],
    'authored.npc.quest.itemsUnavailable': [
        'Передача не состоялась: проверьте вещи, вместимость и награду.',
        'The transfer failed. Check your items, available space and the reward.',
    ],
    'authored.npc.quest.settled': [
        'Договор выполнен. Имущество и награда переданы.',
        'Contract complete. Items and rewards were transferred.',
    ],
    'authored.npc.quest.alreadyRewarded': [
        'Награда уже передана.',
        'The reward has already been paid.',
    ],
    'authored.npc.quest.worldStopped': [
        'Мир остановлен. Договор отменён.',
        'The world stopped. The contract was cancelled.',
    ],
    'authored.npc.quest.issuerDied': [
        'Заказчик погиб. Договор отменён; резерв освобождён.',
        'The quest giver died. The contract was cancelled and the reserved reward was released.',
    ],
    'authored.npc.quest.requiredPlayer': [
        'Предложение с кнопкой «Взять» можно отправить только живому подключённому игроку.',
        'This offer can only be made to a living, connected player.',
    ],
    'authored.npc.quest.cannotOffer': [
        'Не удаётся предложить задание этому собеседнику.',
        'This quest cannot be offered to the current player.',
    ],
    'authored.npc.quest.promisedItemLost': [
        'Обещанной вещи у заказчика нет.',
        'The quest giver no longer has the promised item.',
    ],
    'authored.npc.quest.workerUnavailable': [
        'Это обращение работника сейчас недоступно.',
        'This worker’s request is unavailable.',
    ],
    'authored.npc.quest.workerContact': [
        'Передать трофей клерку и сообщить о расчистке.',
        'Give the trophy to the clerk and report that the area is clear.',
    ],
    'authored.npc.quest.workerProofAccepted': [
        'Трофей принят; повторно приносить его не нужно.',
        'The trophy has been accepted. No additional trophy is needed.',
    ],
    'authored.npc.quest.workerReady': [
        'Работник проверил безопасность и вернулся. Можно получить награду у распорядителя.',
        'The worker checked the site and returned. Collect your reward from the clerk.',
    ],
    'authored.npc.quest.workerAwaitReturn': [
        'Дождаться реальной проверки работы и возвращения работника',
        'Wait for the worker to check the site and return.',
    ],
    'authored.npc.quest.settlementThanks': [
        'Спасибо за помощь! Поручение выполнено, награда передана. Хочешь ещё поручение?',
        'Thanks for your help! The job is done and the reward has been paid. Would you like another job?',
    ],
    'authored.npc.quest.reportThanks': [
        'Спасибо за доклад! Теперь дождёмся проверки рабочего места и возвращения работника.',
        'Thanks for the report! Now we will wait for the worker to check the site and return.',
    ],
    'authored.npc.quest.reported': [
        'Договор сдан, награда передана.',
        'The quest has been turned in and its reward paid.',
    ],
    'authored.npc.quest.returnToGiver': [
        'Вернуться к заказчику и сказать «квест готов»',
        'Return to the quest giver and say “quest complete”.',
    ],
    'authored.npc.quest.returnToNamedGiver': [
        'Вернуться к {issuer} и сказать «квест готов».',
        'Return to {issuerEn} and say “quest complete”.',
    ],
    'authored.npc.quest.conditions': [
        'Выполнить условия поручения',
        'Complete the quest objectives.',
    ],
    'authored.npc.quest.contractConditions': [
        'Выполнить условия договора.',
        'Complete the contract objectives.',
    ],
    'authored.npc.quest.progress': [
        'Прогресс: {progress} / {goal}',
        'Progress: {progress} / {goal}',
    ],
    'authored.npc.quest.workerTitle': [
        'Вернуть к работе: {worker}',
        'Back to work: {workerEn}',
    ],
    'authored.npc.quest.workerDescription': [
        '{worker}: {enemy} мешает работе в {locationRu}. Принесите один трофей, сообщите о расчистке, дождитесь проверочного рабочего рейса и возвращения работника.',
        '{workerEn} cannot work in {locationEn} because of {enemyEn}. Bring one trophy, report that the area is clear, and wait for the worker to check the site and return.',
    ],
    'authored.guild.quest.workerTitle': [
        'Помочь вернуться к работе: {worker}',
        'Help {workerEn} get back to work',
    ],
    'authored.guild.quest.workerDescription': [
        '{worker} не может работать в {locationRu}: мешает {enemy}. Принесите один трофей, сообщите о расчистке и дождитесь рабочего рейса.',
        '{workerEn} cannot work in {locationEn} because of {enemyEn}. Bring one trophy, report that the area is clear, and wait for the worker to check the site.',
    ],
    'authored.guild.quest.rewardMissing': [
        'Обещанная награда недоступна. Можно дождаться её или оставить договор.',
        'The promised reward is unavailable. You may wait for it or abandon the contract.',
    ],
    'authored.guild.quest.slimeHuntTitle': [
        'Зачистка троп',
        'Clear the Trails',
    ],
    'authored.guild.quest.slimeHuntDescription': [
        'Победите трёх враждебных слизней. Для общего прогресса участник отряда должен быть рядом с победой.',
        'Defeat three hostile slimes. A party member must be nearby for the victory to count toward shared progress.',
    ],
    'authored.guild.quest.skeletonHuntTitle': [
        'Кости старого тракта',
        'Bones of the Old Road',
    ],
    'authored.guild.quest.skeletonHuntDescription': [
        'Победите двух скелетов одной группой. Победы засчитываются при участии отряда поблизости.',
        'Defeat two skeletons as a group. Victories count when party members take part nearby.',
    ],
    'authored.guild.quest.frontierTitle': [
        'Разведчики Пограничья',
        'Scouts of the Borderlands',
    ],
    'authored.guild.quest.frontierDescription': [
        'Исследуйте три разные земли за пределами Новогорода. Отряд делится результатами разведки.',
        'Explore three different lands outside Novogorod. The party shares its discoveries.',
    ],
    'authored.exchange.unavailable': [
        'Обмен недоступен.',
        'Trading is unavailable.',
    ],
}

const keysByText = new Map(
    Object.entries(npcQuestText).map(([key, [russian]]) => [russian, key])
)

export function npcQuestMessage(
    text: string | null | undefined
): LocalizedMessage | undefined {
    const key = text == null ? undefined : keysByText.get(text)
    return key === undefined ? undefined : { key }
}

export function workerQuestMessages(
    request: WorkRequestSnapshot,
    source: 'npc' | 'guild'
) {
    const params = {
        worker: request.workerName,
        workerEn: NPC_ENGLISH_NAMES[request.workerId] ?? request.workerName,
        enemy: request.enemyName,
        enemyEn:
            request.requiredTrophyItemId === 'slime_heart'
                ? 'a hostile slime'
                : request.requiredTrophyItemId === 'bone'
                  ? 'a skeleton'
                  : request.enemyName,
        locationRu: request.locationName,
        locationEn:
            WORLD_LOCATION_ENGLISH_NAMES[request.locationId] ??
            request.locationName,
    }
    return {
        titleMessage: { key: `authored.${source}.quest.workerTitle`, params },
        descriptionMessage: {
            key: `authored.${source}.quest.workerDescription`,
            params,
        },
    }
}

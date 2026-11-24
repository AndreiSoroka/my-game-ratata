import { adventureNoticeLines } from './adventureNoticeText'
import { combatNoticeLines } from './combatNoticeText'
import type { LocalizedMessage } from './locales'
import { npcQuestText } from './npcQuestText'
import { worldSignMessages } from './worldSignText'

const lines = {
    ...combatNoticeLines,
    'world.questBoard': ['Доска заказов', 'Quest board'],
    'story.title': [
        'Сердца для колокола памяти',
        'Hearts for the Bell of Memory',
    ],
    'story.description': [
        'Забери три сердца из тел поверженных враждебных слизней и принеси их Мире в Новогород. Сердца вернут силу колоколу памяти.',
        'Take three hearts from defeated hostile slimes and bring them to Mira in Novogorod. The hearts will restore the power of the Bell of Memory.',
    ],
    'story.cityDescription': [
        'Принеси Мире три настоящих слизневых сердца из рюкзака. Это общий городской заказ: после первой успешной сдачи Колокол памяти будет подготовлен, а остальные заявки закроются без расхода вещей. Подготовленный колокол нужно активировать внутри часовни.',
        'Bring Mira three slime hearts from your bag. The first successful delivery prepares the Bell of Memory and closes all other requests without consuming their items. Activate the prepared bell inside the chapel.',
    ],
    'story.finished': [
        'Городской заказ уже выполнен. Вещи не израсходованы, награда не начислена.',
        'The city job is already complete. No items were spent and no reward was paid.',
    ],
    'story.bellActive': [
        'Колокол памяти уже звучит. Сердца больше не требуются.',
        'The Bell of Memory is already ringing. No more hearts are needed.',
    ],
    'story.bellPrepared': [
        'Городской заказ уже выполнен. Колокол подготовлен внутри часовни.',
        'The city job is already complete. The bell is ready inside the chapel.',
    ],
    'story.accepted': [
        'Задание принято. Собери три слизневых сердца.',
        'Quest accepted. Collect three slime hearts.',
    ],
    'story.cityAccepted': [
        'Городской заказ принят. Принеси Мире три слизневых сердца.',
        'City job accepted. Bring Mira three slime hearts.',
    ],
    'story.restore': [
        'Подготовленный Колокол памяти находится внутри часовни. Подойди к нему и прикоснись.',
        'The prepared Bell of Memory is inside the chapel. Approach and touch it.',
    ],
    'story.chapterComplete': [
        'Колокол памяти восстановлен. Первая глава завершена.',
        'The Bell of Memory is restored. Chapter one is complete.',
    ],
    'story.heartsRequired': [
        'В рюкзаке нужны три свободных слизневых сердца.',
        'You need three unreserved slime hearts in your bag.',
    ],
    'story.rewardUnavailable': [
        'Городская награда сейчас недоступна. Вещи не израсходованы.',
        'The city reward is currently unavailable. No items were spent.',
    ],
    'story.reward': [
        'Три слизневых сердца переданы Мире. Общая награда: 40 золотых; твоя доля: {received}.',
        'Mira received all three slime hearts. Total reward: 40 gold. Your share: {received}.',
    ],
    'story.cityReward': [
        'Три сердца переданы Мире, общая награда 40 золотых выплачена. Колокол подготовлен — активируй его внутри часовни.',
        'Mira received three hearts and paid the total reward of 40 gold. Activate the prepared bell inside the chapel.',
    ],
    'dialogue.bellRestored': ['Колокол снова звучит', 'The Bell Rings Again'],
    'dialogue.alarm': ['Тревога в Новогороде', 'Trouble in Novogorod'],
    'dialogue.residents': ['Жители Новогорода', 'Residents of Novogorod'],
    'dialogue.workerRequests': ['Обращения работников', 'Workers’ requests'],
    'dialogue.orders': ['Мои заказы и изготовление', 'My orders and crafting'],
    'dialogue.cityReport': [
        'Что нужно городу? Спрос и запасы',
        'What does the city need? Demand and stocks',
    ],
    'dialogue.repair': ['Почини моё снаряжение', 'Repair my gear'],
    'dialogue.askDragon': [
        'А драконы здесь бывают?',
        'Are there dragons here?',
    ],
    'dialogue.trade': ['Покажи товары', 'Show me your wares'],
    'dialogue.leave': ['До встречи', 'See you later'],
    'dialogue.close': ['Закрыть', 'Close'],
    'dialogue.acceptQuest': [
        'Я принесу три слизневых сердца',
        'I’ll bring three slime hearts',
    ],
    'dialogue.questProgress': [
        'Напомни, что нужно принести',
        'Remind me what to bring',
    ],
    'dialogue.turnInTrophies': [
        'Отдать три сердца · общая награда 40 золотых',
        'Hand over three hearts · total reward 40 gold',
    ],
    'dialogue.restoreWard': [
        'Восстановить колокол памяти',
        'Restore the Bell of Memory',
    ],
    'dialogue.workerRequest': [
        'Обращение: {worker} — {reason}',
        'Work request: {worker} — {reason}',
    ],
    'dialogue.smith': [
        'Я Игнат. Продам топор или кирку, восстановлю оружие и одежду. Мечом дерево рубить можно, но лезвие быстро портится.',
        'I’m Ignat. I sell axes and pickaxes and repair weapons and clothing. You can cut wood with a sword, but it wears down the blade quickly.',
    ],
    'dialogue.restored': [
        'Слышишь? Колокол отзывается во всех двадцати пяти землях Новогорода. Дороги снова помнят свои имена. Сегодня Новогород в безопасности — благодаря тебе.',
        'Hear that? The bell echoes through all twenty-five lands of Novogorod. The roads remember their names again. Novogorod is safe today, thanks to you.',
    ],
    'dialogue.merchant': [
        'У меня есть еда, мечи и сапоги. Колокол умолк, а на дорогах расплодились слизни. Мира знает, как вернуть защиту Новогороду. Сначала поговори с ней.',
        'I have food, swords, and boots. The bell has fallen silent and slimes infest the roads. Mira knows how to protect Novogorod again. Speak to her first.',
    ],
    'dialogue.available': [
        'Я Мира, хранительница Новогорода. Колокол памяти треснул, и дороги начали терять имена. Обыщи тела поверженных враждебных слизней и принеси три сердца: их искры зажгут печать памяти. Я заплачу сорок золотых.',
        'I’m Mira, keeper of Novogorod. The Bell of Memory cracked and the roads began to lose their names. Search defeated hostile slimes and bring me three hearts. Their sparks will light the seal of memory. I’ll pay forty gold.',
    ],
    'dialogue.active': [
        'В твоём рюкзаке {trophies} из трёх слизневых сердец. После победы над враждебным слизнем обыщи его тело и забери сердце в рюкзак. Принеси мне три сердца.',
        'You have {trophies} out of three slime hearts. After defeating a hostile slime, search its body and take the heart. Bring me three.',
    ],
    'dialogue.ready': [
        'Три сердца! В них ещё тлеет искра памяти. Отдай их мне, получи награду — и вместе восстановим колокол.',
        'Three hearts! A spark of memory still burns in them. Hand them over and receive your reward, and together we’ll restore the bell.',
    ],
    'dialogue.completed': [
        'Награда твоя. Я вплела сердца в новую печать. Осталось прикоснуться к колоколу памяти: пусть он снова вернёт дорогам имена.',
        'The reward is yours. I wove the hearts into a new seal. Now touch the Bell of Memory and let it restore the names of the roads.',
    ],
    'dialogue.cancelledPrepared': [
        'Общий городской заказ уже выполнен. Колокол подготовлен внутри часовни: осталось подойти и активировать его.',
        'The city job is already complete. The bell is prepared inside the chapel. Approach it and activate it.',
    ],
    'dialogue.cancelled': [
        'Общий городской заказ уже закрыт. Сердца больше не требуются.',
        'The city job has closed. No more hearts are needed.',
    ],
    'dialogue.dragons': [
        'Драконы? Ты меня с ведьмаком перепутал! В землях Новогорода бед хватает и без них. Здесь двадцать пять земель связаны колоколом памяти: пока он звучит, дороги знают свои имена, а жители помнят тех, кто вернулся. Слизни унесли искры разбитого колокола. Собери три сердца — вернём долине голос.',
        'Dragons? You have me confused with a monster hunter! These lands have enough troubles already. The Bell of Memory ties all twenty-five lands together. While it rings, the roads know their names and people remember who came home. Slimes carried away sparks from the broken bell. Gather three hearts and we can give the valley its voice back.',
    ],
    'resident.guard': [
        'Я стражница Рада. Если ты заметил вора, подойди и подай жалобу через E в течение пяти минут. Имя попадёт в городскую книгу: стража начнёт охоту, торговцы откажут в торговле. Снять запись может сестра Вера в часовне.',
        'I’m Rada of the city watch. If you witness a theft, approach and press E within five minutes to file a report. The watch will hunt the named thief and merchants will refuse to trade. Sister Vera can remove the entry at the chapel.',
    ],
    'resident.cleric': [
        'Я сестра Вера. В часовне можно выбрать покровителя, а молитвы и чудеса укрепляют веру. Падшего можно вернуть лишь в первую минуту: нужен живой клерик рядом. В поход берите того, кто сможет помочь на месте. Если имя занесено в городскую книгу жалоб, я могу отпустить грехи за 30 золотых: подойди и выбери это действие через E.',
        'I’m Sister Vera. You can choose a patron here. Prayers and miracles strengthen your faith. A fallen person can return only within the first minute, with a living cleric nearby. Bring a companion who can help on the spot. If you’re in the city’s offense register, approach and press E for absolution at a cost of 30 gold.',
    ],
    'resident.scholar': [
        'Я Арен, хранитель библиотеки. Открой «Знания»: здесь можно изучить Огненную стрелу, прочесть три главы и передавать знания другим. Если уже служишь богам и знаешь молитву, начать обучение магии не получится.',
        'I’m Aren, the librarian. Open Knowledge to learn Firebolt, read three chapters, and share what you know. If you already serve the gods and know a prayer, you cannot begin learning magic.',
    ],
    'resident.princess': [
        'Я Лея. Корона не обязывает меня сидеть взаперти. Сначала познакомимся: я выбираю спутников сама.',
        'I’m Leia. A crown does not mean I have to stay indoors. Let’s get acquainted first. I choose my own companions.',
    ],
    'resident.veteran': [
        'Бран. Если идём вместе — прикрою. Но я товарищ, а не чья-то собственность.',
        'Bran. If we go together, I’ll watch your back. I’m a companion and I make my own choices.',
    ],
    'resident.kaplya': [
        'Буль! Я Капля. Поговорим?',
        'Glub! I’m Kaplya. Want to talk?',
    ],
    'resident.wanderer1': [
        'Прохор. Дома нет, срочных дел тоже. Давай познакомимся — после разговора могу помочь с простой работой.',
        'I’m Prokhor. No home and nothing urgent to do. Let’s get acquainted, and I may help you with simple work.',
    ],
    'resident.wanderer2': [
        'Я Дарья. Пока скитаюсь по Новогороду. Помоги Мире собрать сердца для колокола памяти — тогда помогу и тебе.',
        'I’m Darya. I wander around Novogorod for now. Help Mira gather hearts for the Bell of Memory, and then I’ll help you.',
    ],
    'resident.weaver': [
        'Мила. В мастерской всегда есть работа. Собери волокно и древесину — снаряжение само себя не сделает. За стены без припасов не выходи.',
        'I’m Mila. There’s always work in the workshop. Gather fiber and timber to make your gear, and take supplies before leaving the walls.',
    ],
    'resident.smith': [
        'Игнат. Словом стаю не остановишь. Сделай меч, возьми еды и найди товарищей. Даже ближние предместья не прощают беспечности.',
        'I’m Ignat. Words won’t stop a pack. Make a sword, take food, and find allies. Even the nearby outskirts punish carelessness.',
    ],
    'resident.herbalist': [
        'Я Злата. Травы ищи у площади, а лекарский сад — рядом с моим домом. В походе еда и помощь клерика важнее тяжёлого кошелька.',
        'I’m Zlata. Look near the square for herbs. The medicinal garden is beside my house. Food and a cleric will do you more good on the road than a heavy purse.',
    ],
    'resident.baker': [
        'Елисей. После ночной дороги хорошо вернуться в тёплый дом. Запасы можно купить в городской лавке Саввы, когда торговля открыта.',
        'I’m Yelisey. It’s good to come home to a warm house after a night on the road. You can buy supplies at Savva’s shop when it’s open.',
    ],
    'resident.cartographer': [
        'Нестор. Каждая дорога от Новогорода уводит в более опасные земли. В углах моего атласа ещё возвращались не все. Держитесь вместе.',
        'I’m Nestor. Every road out of Novogorod leads to more dangerous lands. Some who reached the corners of my atlas never returned. Stay together.',
    ],
    'resident.tailor': [
        'Тихон. Проходи, только не наступи на ткань. Если ищешь спутника, загляни в «Три дороги»: там останавливаются Бран и Лея.',
        'I’m Tikhon. Come in and mind the cloth. If you need a companion, try the Three Roads Tavern. Bran and Leia stay there.',
    ],
    'resident.default': [
        'Я останусь в Новогороде: здесь меня ждут дела. Поговорить могу, а идти в поход не обещаю.',
        'I’ll stay in Novogorod. I have things to do here. I’m happy to talk, but I cannot promise to travel with you.',
    ],
    'shop.food': ['Дорожная еда', 'Trail rations'],
    'shop.sword': ['Простой меч', 'Simple sword'],
    'shop.boots': ['Кожаные сапоги', 'Leather boots'],
    'shop.torch': ['Факел', 'Torch'],
    'shop.lantern': ['Фонарь', 'Lantern'],
    'recipe.stone_axe': ['Сделать каменный топор', 'Make a stone axe'],
    'recipe.bake_bread': ['Испечь хлеб', 'Bake bread'],
    'recipe.food': ['Приготовить походную еду', 'Prepare trail rations'],
    'recipe.boots': ['Сплести сапоги', 'Weave boots'],
    'recipe.simple_sword': ['Собрать простой меч', 'Craft a simple sword'],
    'recipe.axe': ['Сделать топор', 'Make an axe'],
    'recipe.pickaxe': ['Сделать кирку', 'Make a pickaxe'],
    ...adventureNoticeLines,
} as const

export type AuthoredTextKey = keyof typeof lines
type Params = LocalizedMessage['params']

export function authoredMessage(
    key: AuthoredTextKey,
    params?: Params
): LocalizedMessage {
    return {
        key: `authored.${key}`,
        ...(params === undefined ? {} : { params }),
    }
}

export function authoredRussian(key: AuthoredTextKey, params?: Params): string {
    return lines[key][0].replace(/\{(\w+)\}/gu, (source, name: string) =>
        String(params?.[name] ?? source)
    )
}

export function authoredPhrase(
    key: AuthoredTextKey,
    params?: Params
): { text: string; textMessage: LocalizedMessage } {
    return {
        text: authoredRussian(key, params),
        textMessage: authoredMessage(key, params),
    }
}

const pairs = {
    ...worldSignMessages,
    ...npcQuestText,
    ...Object.fromEntries(
        Object.entries(lines).map(([key, entry]) => [`authored.${key}`, entry])
    ),
}

export const authoredMessages = {
    ru: Object.fromEntries(
        Object.entries(pairs).map(([key, pair]) => [key, pair[0]])
    ),
    en: Object.fromEntries(
        Object.entries(pairs).map(([key, pair]) => [key, pair[1]])
    ),
}

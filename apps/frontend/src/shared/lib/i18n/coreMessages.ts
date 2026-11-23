import { REGION_NAME } from '@my-game-ratata/contracts'

export const menuMessages = {
    dialog: ['Игровое меню', 'Game menu'],
    shortcut: ['Меню · Esc', 'Menu · Esc'],
    resume: ['Вернуться в игру', 'Resume game'],
    character: ['Персонаж', 'Character'],
    inventory: ['Инвентарь', 'Inventory'],
    markers: ['Метки', 'Markers'],
    scenarios: ['Сценарии', 'Scenarios'],
    soundOn: ['Звук: включён', 'Sound: on'],
    soundOff: ['Звук: выключен', 'Sound: off'],
    muted: ['Без звука', 'Muted'],
    npcVoice: ['Озвучка NPC', 'NPC voice'],
    npcVoiceOn: ['Озвучка NPC: включена', 'NPC voice: on'],
    npcVoiceOff: ['Озвучка NPC: выключена', 'NPC voice: off'],
    language: ['Язык интерфейса', 'Interface language'],
    leave: ['Выйти из игры', 'Leave game'],
} as const

export const joinMessages = {
    title: ['Ratata — Земли Новогорода', 'Ratata — Lands of Novogorod'],
    region: [REGION_NAME, 'Lands of Novogorod'],
    projectLinks: ['Ссылки проекта', 'Project links'],
    locations: [
        '{count} локация | {count} локации | {count} локаций',
        '{count} location | {count} locations',
    ],
    city: ['Новогород', 'Novogorod'],
    distantLands: ['и дальние земли', 'and the distant lands'],
    story: [
        'Почему твоя Искра пробудилась именно в этом теле, погребённом у часовни Новогорода? Расспроси жителей о прежних жизнях и найди попутчика, чтобы вместе выйти за городские ворота.',
        'Why did your Spark awaken in this body, buried by the chapel of Novogorod? Ask the townsfolk about past lives and find a companion to venture beyond the city gates together.',
    ],
    invitation: [
        'Искра живёт в персонаже, пока с ним связан разум. Эхо следует привычкам и повторяет знакомые дела. Собирайте свои сценарии и договаривайтесь о помощи.',
        'A Spark lives in a character while a mind guides them. An Echo follows familiar habits and routines. Build your own scenarios and ask others for help.',
    ],
    heroName: ['Имя героя', 'Hero name'],
    regenerateName: ['Сгенерировать другое имя', 'Generate another name'],
    enter: ['Войти', 'Enter game'],
    background: ['Прошлое героя', 'Hero background'],
    backgroundHint: [
        'Прошлое даёт первые преимущества. Любой герой может освоить меч, чудеса и магию через обучение и практику. Новая жизнь начинается без золота.',
        'Your background grants starting bonuses. Any hero can master the sword, miracles and magic through training and practice. A new life starts without gold.',
    ],
    backgroundBonuses: ['Постоянные бонусы прошлого', 'Permanent background bonuses'],
    backgroundName: ['Прошлое: {name}', 'Background: {name}'],
    healthBonus: ['+{amount} к здоровью', '+{amount} health'],
    energyBonus: ['+{amount} к энергии', '+{amount} energy'],
    manaBonus: ['+{amount} к мане', '+{amount} mana'],
    noResourceBonus: ['Без прибавки ресурсов', 'No resource bonus'],
    prayerBonus: ['+20% опыта всех молитвенных школ', '+20% experience in all prayer schools'],
    masteryBonus: ['+20% опыта созвездия «{name}»', '+20% experience in the {name} constellation'],
} as const

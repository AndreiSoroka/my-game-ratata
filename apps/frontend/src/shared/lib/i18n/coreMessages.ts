import { REGION_NAME } from '@my-game-ratata/contracts'

export const menuMessages = {
    decreaseNumber: ['Уменьшить: {label}', 'Decrease: {label}'],
    increaseNumber: ['Увеличить: {label}', 'Increase: {label}'],
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

export const worldSettingsMessages = {
    aiChecking: ['Проверяем доступность ИИ…', 'Checking AI availability…'],
    aiUnavailable: ['ИИ недоступен. Повторяем проверку.', 'AI is unavailable. Retrying.'],
    serverConnection: [
        'Не удалось связаться с игровым сервером.',
        'Could not reach the game server.',
    ],
    advanced: ['Дополнительные настройки', 'Advanced settings'],
    title: ['Настройки мира', 'World settings'],
    close: ['Закрыть настройки мира', 'Close world settings'],
    localChecking: [
        'Проверяем доступ с машины сервера…',
        'Checking access from the server machine…',
    ],
    remoteHttps: ['Удалённый вход в Admin доступен по HTTPS.', 'Remote Admin access uses HTTPS.'],
    terminalCode: ['Код из терминала сервера', 'Server terminal code'],
    checkingCode: ['Проверяем…', 'Checking…'],
    checkCode: ['Проверить код', 'Verify code'],
    invalidCode: [
        'Код не принят. Проверьте код или получите новый в терминале сервера.',
        'Code rejected. Check it or get a new code in the server terminal.',
    ],
    sessionExpired: ['Сессия Admin завершилась.', 'The Admin session expired.'],
    loadFailed: ['Не удалось загрузить режим мира.', 'Could not load the world mode.'],
    saveFailed: ['Не удалось сохранить режим мира.', 'Could not save the world mode.'],
    loading: ['Загружаем режим мира…', 'Loading world mode…'],
    emptyWorld: ['Когда в мире нет игроков', 'When there are no players in the world'],
    online_ai: ['ИИ ждёт игрока', 'AI waits for players'],
    online_aiDescription: [
        'Игровые действия и таймеры идут. ИИ планирует, пока кто-то в мире.',
        'Actions and timers continue. AI makes plans while someone is in the world.',
    ],
    always: ['Мир живёт без игроков', 'The world runs without players'],
    alwaysDescription: [
        'Игровые действия, таймеры и автономный ИИ продолжаются.',
        'Actions, timers and autonomous AI continue.',
    ],
    paused_when_empty: ['Мир на паузе без игроков', 'The world pauses without players'],
    paused_when_emptyDescription: [
        'Симуляция и игровые сроки продолжаются после входа игрока.',
        'Simulation and deadlines resume when a player joins.',
    ],
    saving: ['Сохраняем…', 'Saving…'],
    save: ['Сохранить', 'Save'],
} as const

import './interfaceStory.css'

export type ResourceKind = 'energy' | 'hp' | 'mana'

export interface ResourceValue {
    current: number
    kind: ResourceKind
    max: number
}

export interface ChatMessage {
    author: string
    tone: 'local' | 'system' | 'whisper'
    text: string
}

export interface InterfaceStoryOptions {
    chatActive: boolean
    chatDraft: string
    messages: ChatMessage[]
    resources: ResourceValue[]
    serverLabel: string
    showAbilities: boolean
}

const RESOURCE_META: Record<
    ResourceKind,
    {
        label: string
        shortLabel: string
        valueClass: string
    }
> = {
    energy: {
        label: 'Energy',
        shortLabel: 'EN',
        valueClass: 'ratata-ui-resource__value--energy',
    },
    hp: {
        label: 'Health',
        shortLabel: 'HP',
        valueClass: 'ratata-ui-resource__value--hp',
    },
    mana: {
        label: 'Mana',
        shortLabel: 'MP',
        valueClass: 'ratata-ui-resource__value--mana',
    },
}

const DEFAULT_MESSAGES: ChatMessage[] = [
    {
        author: 'System',
        text: 'Campfire warmth restored 12 energy.',
        tone: 'system',
    },
    {
        author: 'Mira',
        text: 'The northern gate is quiet again.',
        tone: 'local',
    },
    {
        author: 'Whisper',
        text: 'Something moves under the old bridge.',
        tone: 'whisper',
    },
]

const DEFAULT_RESOURCES: ResourceValue[] = [
    { current: 84, kind: 'hp', max: 100 },
    { current: 58, kind: 'mana', max: 90 },
    { current: 36, kind: 'energy', max: 60 },
]

export function renderStatusGroup(
    resources: ResourceValue[] = DEFAULT_RESOURCES,
    serverLabel = 'local realm'
): HTMLElement {
    const panel = document.createElement('section')
    panel.className = 'ratata-ui-panel ratata-ui-status'
    panel.dataset.interfaceReady = 'true'
    panel.setAttribute('aria-label', 'Player status')

    const header = document.createElement('div')
    header.className = 'ratata-ui-status__header'

    const name = document.createElement('span')
    name.className = 'ratata-ui-status__name'
    name.textContent = 'Adventurer'

    const server = document.createElement('span')
    server.className = 'ratata-ui-status__server'
    server.textContent = serverLabel

    header.append(name, server)
    panel.append(header)

    const list = document.createElement('div')
    list.className = 'ratata-ui-status__bars'

    for (const resource of resources) {
        list.append(renderResourceBar(resource))
    }

    panel.append(list)

    return panel
}

export function renderChatPanel({
    active = true,
    draft = '/say Ready when you are.',
    messages = DEFAULT_MESSAGES,
}: {
    active?: boolean
    draft?: string
    messages?: ChatMessage[]
} = {}): HTMLElement {
    const panel = document.createElement('section')
    panel.className = 'ratata-ui-panel ratata-ui-chat'
    panel.dataset.interfaceReady = 'true'
    panel.setAttribute('aria-label', 'Chat')

    const log = document.createElement('div')
    log.className = 'ratata-ui-chat__log'

    for (const message of messages) {
        const row = document.createElement('p')
        row.className = `ratata-ui-chat__message ratata-ui-chat__message--${message.tone}`

        const author = document.createElement('span')
        author.className = 'ratata-ui-chat__author'
        author.textContent = message.author

        const text = document.createElement('span')
        text.className = 'ratata-ui-chat__text'
        text.textContent = message.text

        row.append(author, text)
        log.append(row)
    }

    const input = document.createElement('div')
    input.className = active
        ? 'ratata-ui-chat__input ratata-ui-chat__input--active'
        : 'ratata-ui-chat__input'
    input.textContent = active ? draft : ''

    panel.append(log, input)

    return panel
}

export function renderFullHud(options: Partial<InterfaceStoryOptions> = {}): HTMLElement {
    const root = document.createElement('main')
    root.className = 'ratata-ui-viewport'
    root.dataset.interfaceReady = 'true'

    const status = renderStatusGroup(
        options.resources ?? DEFAULT_RESOURCES,
        options.serverLabel ?? '127.0.0.1:2567'
    )
    status.classList.add('ratata-ui-viewport__status')

    const chat = renderChatPanel({
        active: options.chatActive ?? true,
        draft: options.chatDraft ?? '/party Need mana before the bridge.',
        messages: options.messages ?? DEFAULT_MESSAGES,
    })
    chat.classList.add('ratata-ui-viewport__chat')

    root.append(renderGameSurface(), status, chat)

    if (options.showAbilities ?? true) {
        root.append(renderAbilityDock())
    }

    return root
}

function renderResourceBar(resource: ResourceValue): HTMLElement {
    const meta = RESOURCE_META[resource.kind]
    const safeMax = Math.max(resource.max, 1)
    const safeCurrent = Math.min(Math.max(resource.current, 0), safeMax)
    const percent = Math.round((safeCurrent / safeMax) * 100)

    const bar = document.createElement('div')
    bar.className = 'ratata-ui-resource'

    const label = document.createElement('span')
    label.className = 'ratata-ui-resource__label'
    label.textContent = meta.shortLabel

    const track = document.createElement('span')
    track.className = 'ratata-ui-resource__track'

    const value = document.createElement('span')
    value.className = `ratata-ui-resource__value ${meta.valueClass}`
    value.style.width = `${percent}%`

    const text = document.createElement('span')
    text.className = 'ratata-ui-resource__text'
    text.textContent = `${safeCurrent}/${safeMax}`
    text.setAttribute('aria-label', `${meta.label}: ${safeCurrent} of ${safeMax}`)

    track.append(value, text)
    bar.append(label, track)

    return bar
}

function renderAbilityDock(): HTMLElement {
    const dock = document.createElement('nav')
    dock.className = 'ratata-ui-abilities'
    dock.setAttribute('aria-label', 'Abilities')

    const items = ['1', '2', '3', '4', '5']

    for (const item of items) {
        const button = document.createElement('button')
        button.className = 'ratata-ui-abilities__slot'
        button.type = 'button'
        button.textContent = item
        dock.append(button)
    }

    return dock
}

function renderGameSurface(): HTMLElement {
    const surface = document.createElement('div')
    surface.className = 'ratata-ui-surface'

    const player = document.createElement('div')
    player.className = 'ratata-ui-surface__player'

    const marker = document.createElement('div')
    marker.className = 'ratata-ui-surface__marker'

    surface.append(player, marker)

    return surface
}

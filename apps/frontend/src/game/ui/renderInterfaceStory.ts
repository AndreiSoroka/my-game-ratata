import './interfaceStory.css'

import { kenneyBar, kenneyTitle, kenneyWindow } from './kenneyUi'

export type ResourceKind = 'energy' | 'hp' | 'mana'

export interface ResourceValue {
    current: number
    kind: ResourceKind
    max: number
}

export interface LogMessage {
    author: string
    tone: 'local' | 'system' | 'whisper'
    text: string
}

export interface InterfaceStoryOptions {
    messages: LogMessage[]
    resources: ResourceValue[]
    serverLabel: string
    showAbilities: boolean
    speechText: string
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

const DEFAULT_MESSAGES: LogMessage[] = [
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
    const panel = kenneyWindow({
        content: [renderStatusHeader(serverLabel), renderStatusBars(resources)],
        fixed: true,
        variant: 'parchment',
    })
    panel.classList.add('ratata-ui-panel', 'ratata-ui-status')
    panel.dataset.interfaceReady = 'true'
    panel.setAttribute('aria-label', 'Player status')

    return panel
}

function renderStatusHeader(serverLabel: string): HTMLElement {
    const header = document.createElement('div')
    header.className = 'ratata-ui-status__header'

    const name = kenneyTitle('Adventurer')
    name.classList.add('ratata-ui-status__name')

    const server = document.createElement('span')
    server.className = 'ratata-ui-status__server'
    server.textContent = serverLabel

    header.append(name, server)

    return header
}

function renderStatusBars(resources: ResourceValue[]): HTMLElement {
    const list = document.createElement('div')
    list.className = 'ratata-ui-status__bars'

    for (const resource of resources) {
        list.append(renderResourceBar(resource))
    }

    return list
}

export function renderLogPanel({
    messages = DEFAULT_MESSAGES,
}: {
    messages?: LogMessage[]
} = {}): HTMLElement {
    const panel = document.createElement('section')
    panel.className = 'ratata-ui-panel ratata-ui-logs'
    panel.dataset.interfaceReady = 'true'
    panel.setAttribute('aria-label', 'Logs')

    const log = document.createElement('div')
    log.className = 'ratata-ui-logs__list'

    for (const message of messages) {
        const row = document.createElement('p')
        row.className = `ratata-ui-logs__message ratata-ui-logs__message--${message.tone}`

        const author = document.createElement('span')
        author.className = 'ratata-ui-logs__author'
        author.textContent = message.author

        const text = document.createElement('span')
        text.className = 'ratata-ui-logs__text'
        text.textContent = message.text

        row.append(author, text)
        log.append(row)
    }

    panel.append(log)

    return panel
}

export function renderSpeechBubble(text = 'Need mana before the bridge.'): HTMLElement {
    const bubble = document.createElement('div')
    bubble.className = 'ratata-ui-speech'
    bubble.dataset.interfaceReady = 'true'
    bubble.setAttribute('role', 'status')
    bubble.textContent = text

    return bubble
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

    const logs = renderLogPanel({ messages: options.messages ?? DEFAULT_MESSAGES })
    logs.classList.add('ratata-ui-viewport__logs')

    const speech = renderSpeechBubble(options.speechText ?? 'Need mana before the bridge.')
    speech.classList.add('ratata-ui-viewport__speech')

    root.append(renderGameSurface(), status, logs, speech)

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

    const track = kenneyBar({
        current: percent,
        kind: resource.kind,
        label: meta.label,
        max: 100,
    })
    track.classList.add('ratata-ui-resource__track')
    track.querySelector('.ratata-kenney-bar__fill')?.classList.add('ratata-ui-resource__value')
    track.querySelector('.ratata-kenney-bar__fill')?.classList.add(meta.valueClass)
    track.querySelector('.ratata-kenney-bar__text')?.classList.add('ratata-ui-resource__text')
    const text = track.querySelector('.ratata-kenney-bar__text')
    if (text !== null) {
        text.textContent = `${safeCurrent}/${safeMax}`
        text.setAttribute('aria-label', `${meta.label}: ${safeCurrent} of ${safeMax}`)
    }

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

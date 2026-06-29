import './kenneyUi.css'

export type KenneyBarKind = 'energy' | 'hp' | 'mana'
export type KenneyButtonVariant = 'metal' | 'red' | 'wood'
export type KenneyWindowVariant = 'blue' | 'metal' | 'parchment' | 'wood'

export interface KenneyBarOptions {
    current: number
    kind: KenneyBarKind
    label: string
    max: number
}

export function kenneyStage(label: string): HTMLElement {
    const stage = document.createElement('main')
    stage.className = 'ratata-kenney-stage'
    stage.dataset.interfaceReady = 'true'
    stage.setAttribute('aria-label', label)

    return stage
}

export function kenneyStack(): HTMLElement {
    const stack = document.createElement('div')
    stack.className = 'ratata-kenney-stack'

    return stack
}

export function kenneyRow(): HTMLElement {
    const row = document.createElement('div')
    row.className = 'ratata-kenney-row'

    return row
}

export function kenneyWindow(options: {
    content: Node[]
    fixed?: boolean
    title?: string
    variant?: KenneyWindowVariant
}): HTMLElement {
    const windowElement = document.createElement('section')
    const variant = options.variant ?? 'parchment'
    windowElement.className = `ratata-kenney-window ratata-kenney-window--${variant}`
    windowElement.classList.toggle('ratata-kenney-window--fixed', options.fixed ?? false)

    if (options.title !== undefined) {
        windowElement.append(kenneyTitle(options.title))
    }

    const body = document.createElement('div')
    body.className = 'ratata-kenney-window__body'
    body.append(...options.content)
    windowElement.append(body)

    return windowElement
}

export function kenneyTitle(text: string, compact = false): HTMLElement {
    const title = document.createElement('span')
    title.className = 'ratata-kenney-title'
    title.classList.toggle('ratata-kenney-title--compact', compact)
    title.textContent = text

    return title
}

export function kenneyButton(options: {
    label: string
    variant?: KenneyButtonVariant
    width?: number
}): HTMLButtonElement {
    const button = document.createElement('button')
    const variant = options.variant ?? 'wood'
    button.className = `ratata-kenney-button ratata-kenney-button--${variant}`
    button.type = 'button'
    button.textContent = options.label

    if (options.width !== undefined) {
        button.classList.add('ratata-kenney-button--static')
        button.style.setProperty('--ratata-kenney-button-width', `${String(options.width)}px`)
    }

    return button
}

export function kenneyBar(options: KenneyBarOptions): HTMLElement {
    const safeMax = Math.max(options.max, 1)
    const current = Math.min(Math.max(options.current, 0), safeMax)
    const percent = Math.round((current / safeMax) * 100)
    const track = document.createElement('span')
    track.className = 'ratata-kenney-bar'

    const fill = document.createElement('span')
    fill.className = `ratata-kenney-bar__fill ratata-kenney-bar__fill--${options.kind}`
    fill.style.width = `${String(percent)}%`

    const text = document.createElement('span')
    text.className = 'ratata-kenney-bar__text'
    text.textContent = `${String(current)}/${String(safeMax)}`
    text.setAttribute('aria-label', `${options.label}: ${String(current)} of ${String(safeMax)}`)

    track.append(fill, text)

    return track
}

export function paragraph(text: string): HTMLParagraphElement {
    const paragraphElement = document.createElement('p')
    paragraphElement.textContent = text

    return paragraphElement
}

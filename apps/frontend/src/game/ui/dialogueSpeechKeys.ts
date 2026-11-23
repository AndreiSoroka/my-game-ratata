import type { AdventureDialogue } from '@my-game-ratata/contracts'

import { speechBubbleId } from './speechReceipts'

const focusTargets = '[data-dialogue-action]:not(:disabled), [data-dialogue-focus]:not(:disabled)'

function speechText(dialogue: AdventureDialogue): HTMLElement | null {
    return (
        document
            .getElementById(speechBubbleId(dialogue.npcId, dialogue.speechId))
            ?.querySelector<HTMLElement>('.speech-text') ?? null
    )
}
export function dialogueSpeechKeys(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    dialogue: AdventureDialogue | null
): boolean {
    if (!dialogue || dialogue.kind === 'sign') return false
    const speech = speechText(dialogue)
    if (!speech) return false
    if (event.code === 'PageDown' || event.code === 'PageUp') {
        event.preventDefault()
        speech.focus()
        speech.scrollTop +=
            (event.code === 'PageDown' ? 1 : -1) * Math.max(100, speech.clientHeight * 0.8)
        return true
    }
    if (event.code !== 'Tab') return false
    const actions = Array.from(panel?.querySelectorAll<HTMLElement>(focusTargets) ?? [])
    const cycle = [...actions, speech]
    const current = cycle.findIndex((element) => element === document.activeElement)
    const direction = event.shiftKey ? -1 : 1
    event.preventDefault()
    cycle[(current + direction + cycle.length) % cycle.length]?.focus()
    return true
}
export function returnFromSpeech(event: KeyboardEvent, id: string): void {
    const panel = owningDialogue(id)
    if (event.code === 'Escape' && !panel) {
        event.preventDefault()
        document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
        return
    }
    if (event.code !== 'Tab') return
    const actions = Array.from(panel?.querySelectorAll<HTMLElement>(focusTargets) ?? [])
    const target = event.shiftKey ? actions.at(-1) : actions[0]
    if (target) {
        event.preventDefault()
        target.focus()
    }
}

function owningDialogue(id: string): HTMLElement | undefined {
    return Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-describedby]')
    ).find((element) => element.getAttribute('aria-describedby') === id)
}

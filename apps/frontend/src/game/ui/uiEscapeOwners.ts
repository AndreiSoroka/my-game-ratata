import { onBeforeUnmount, onMounted, type Ref } from 'vue'

interface EscapeOwner {
    active: () => boolean
    escape: () => void
    element?: Ref<HTMLElement | undefined>
    priority?: number
}
const owners = new Map<number, EscapeOwner>()
let nextOwner = 0

/** One dispatcher per page; visible owners register behavior, never competing listeners. */
export function useEscapeOwner(owner: EscapeOwner): void {
    const id = ++nextOwner
    onMounted(() => {
        if (owners.size === 0) window.addEventListener('keydown', dispatchEscape, true)
        owners.set(id, owner)
    })
    onBeforeUnmount(() => {
        owners.delete(id)
        if (owners.size === 0) window.removeEventListener('keydown', dispatchEscape, true)
    })
}

function dispatchEscape(event: KeyboardEvent): void {
    if ((event.code !== 'Escape' && event.key !== 'Escape') || event.isComposing) return
    const owner = currentOwner(event)
    if (!owner) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!event.repeat) owner.escape()
}

function currentOwner(event: KeyboardEvent): EscapeOwner | undefined {
    const active = [...owners].filter(([, owner]) => owner.active())
    active.sort(
        ([firstId, first], [secondId, second]) =>
            (second.priority ?? 100) - (first.priority ?? 100) || secondId - firstId
    )
    const focus = event.target instanceof HTMLElement ? event.target : document.activeElement
    const first = active[0]?.[1]
    if (focus instanceof HTMLElement) {
        const focused = active.find(([, owner]) => owner.element?.value?.contains(focus))?.[1]
        if (focused) return (focused.priority ?? 100) === (first?.priority ?? 100) ? focused : first
        // A foreign editor/dialog owns its Escape, even if one of our windows is visible.
        if (
            focus.closest(
                '[role="dialog"], [role="menu"], input, textarea, select, [contenteditable="true"]'
            )
        )
            return undefined
    }
    return first
}

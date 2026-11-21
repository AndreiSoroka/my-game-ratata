import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { MenuItem } from '../model/menu'
import { menuHighlightPointer } from './menuHighlightPointer'

/** Presentation ownership is independent from the application's command/focus handling. */
export function useMenuHighlight(items: () => readonly MenuItem[]) {
    const root = ref<HTMLElement>()
    const mode = ref<'keyboard' | 'pointer'>('keyboard')
    const hovered = ref<string>()
    const focused = ref<string>()
    const highlighted = computed(() => {
        const id = mode.value === 'pointer' ? hovered.value : focused.value
        return items().some((item) => item.id === id && !item.disabled) ? id : undefined
    })
    function itemButton(target: EventTarget | null): HTMLButtonElement | undefined {
        const button =
            target instanceof Element
                ? target.closest<HTMLButtonElement>('button[data-menu-item]')
                : null
        return button && root.value?.contains(button) ? button : undefined
    }
    function focus(event: FocusEvent): void {
        const button = itemButton(event.target)
        focused.value = button?.dataset.menuItem
    }
    function blur(): void {
        focused.value = undefined
    }
    function keyboard(): void {
        mode.value = 'keyboard'
        hovered.value = undefined
        focused.value = itemButton(document.activeElement)?.dataset.menuItem
    }
    function reset(): void {
        mode.value = 'pointer'
        hovered.value = undefined
        focused.value = undefined
    }
    onMounted(() => {
        window.addEventListener('blur', reset)
        document.addEventListener('keydown', keyboard, true)
    })
    onBeforeUnmount(() => {
        window.removeEventListener('blur', reset)
        document.removeEventListener('keydown', keyboard, true)
    })
    return {
        root,
        highlighted,
        takeControl: keyboard,
        ...menuHighlightPointer(mode, hovered, itemButton),
        focus,
        blur,
        keyboard,
        reset,
    }
}

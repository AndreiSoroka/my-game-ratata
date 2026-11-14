import { isEditableTarget } from './runtimeQueries'

/** Menus and editable controls retain ownership of keyboard input. */
export function isGameKeyboardBlocked(event: KeyboardEvent): boolean {
    return (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        document.querySelector('[role="dialog"], [role="menu"]') !== null
    )
}

import { gameKeyBlocked } from '../ui/keyboardOwnership'

/** Menus and editable controls retain ownership of keyboard input. */
export function isGameKeyboardBlocked(event: KeyboardEvent): boolean {
    return gameKeyBlocked(event)
}

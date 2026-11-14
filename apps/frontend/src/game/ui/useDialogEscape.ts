import type { Ref } from 'vue'

import { useEscapeOwner } from './uiEscapeOwners'

/** Escape remains owned after a canvas click, but never closes another focused dialog. */
export function useDialogEscape(panel: Ref<HTMLElement | undefined>, close: () => void): void {
    useEscapeOwner({ active: () => Boolean(panel.value), escape: close, element: panel })
}

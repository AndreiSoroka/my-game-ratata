import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

export interface UiFieldProps {
    border?: FantasyBorderVariant
    invalid?: boolean
}

export type UiInputType = 'text' | 'search' | 'email' | 'password' | 'tel' | 'url'

export interface UiInputProps extends UiFieldProps {
    type?: UiInputType
}

interface UiFieldHandle<Element extends HTMLInputElement | HTMLTextAreaElement> {
    readonly element: Element | null
    focus(options?: FocusOptions): void
    select(): void
}

export type UiInputHandle = UiFieldHandle<HTMLInputElement>
export type UiTextareaHandle = UiFieldHandle<HTMLTextAreaElement>

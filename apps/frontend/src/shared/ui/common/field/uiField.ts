import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

export interface UiFieldProps {
    border?: FantasyBorderVariant
    invalid?: boolean
}

export type UiInputType =
    | 'text'
    | 'search'
    | 'email'
    | 'password'
    | 'tel'
    | 'url'
    | 'number'
    | 'checkbox'
    | 'radio'
    | 'range'

export interface UiInputProps extends UiFieldProps {
    type?: UiInputType
    borderWidth?: number
    focusRing?: boolean
    framed?: boolean
}

export interface UiSelectProps extends UiFieldProps {
    borderWidth?: number
    focusRing?: boolean
}

interface UiFieldHandle<Element extends HTMLInputElement | HTMLTextAreaElement> {
    readonly element: Element | null
    focus(options?: FocusOptions): void
    select(): void
}

export type UiInputHandle = UiFieldHandle<HTMLInputElement>
export type UiTextareaHandle = UiFieldHandle<HTMLTextAreaElement>

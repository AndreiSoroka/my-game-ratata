export interface ItemSlotProps {
    as?: 'span' | 'button'
    selected?: boolean
    empty?: boolean
    disabled?: boolean
    size?: 'default' | 'compact'
    quantity?: number | undefined
    src?: string | undefined
    alt?: string | undefined
}

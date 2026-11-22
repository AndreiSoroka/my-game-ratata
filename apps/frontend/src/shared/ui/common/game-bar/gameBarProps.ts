export interface GameBarProps {
    value: number
    max?: number
    segments?: readonly number[]
    color?: string
    trackColor?: string
    textColor?: string
    height?: number
    label?: string
    showValue?: boolean
    shadow?: boolean
}

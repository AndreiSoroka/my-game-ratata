export interface ChatInputState {
    active: boolean
    draft: string
    maxLength: number
}

export const chatMaxLength = 400

export function chatDuration(text: string): number {
    return Math.max(1200, Math.min(8000, 1200 + text.length * 60))
}

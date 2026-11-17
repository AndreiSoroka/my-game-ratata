import type { SpeechActivityCommand } from '@my-game-ratata/contracts'

import { type ChatInputState, chatMaxLength } from './chatInput'
import { SpeechActivityEmitter } from './speechActivityEmitter'

export class RuntimeChatInput {
    private active = false
    private draft = ''
    private readonly onState: (state: ChatInputState) => void
    private readonly onBegin?: () => void
    private readonly activity: SpeechActivityEmitter | undefined

    public constructor(
        onState: (state: ChatInputState) => void,
        onBegin?: () => void,
        sendActivity?: (command: SpeechActivityCommand) => void
    ) {
        this.activity = sendActivity
            ? new SpeechActivityEmitter(sendActivity, { channel: 'say' })
            : undefined
        this.onState = onState
        this.onBegin = onBegin
    }

    public get isActive(): boolean {
        return this.active
    }

    public stopActivity(): void {
        this.activity?.stop()
    }

    public cancel(): void {
        this.end()
    }

    public handleKey(event: KeyboardEvent, sendChat: (text: string) => void): boolean {
        if (event.key === 'Enter') {
            event.preventDefault()

            if (this.active) {
                this.submit(sendChat)
            } else {
                this.begin()
            }

            return true
        }

        if (!this.active) {
            return false
        }

        event.preventDefault()

        if (event.key === 'Escape') {
            this.end()
            return true
        }

        if (event.key === 'Backspace') {
            this.draft = this.draft.slice(0, -1)
            this.emitState()
            return true
        }

        if (isPrintableKey(event) && this.draft.length < chatMaxLength) {
            this.draft += event.key
            this.emitState()
        }

        return true
    }

    private begin(): void {
        this.active = true
        this.draft = ''
        this.onBegin?.()
        this.emitState()
    }

    private submit(sendChat: (text: string) => void): void {
        const text = this.draft.trim()

        if (text.length > 0) {
            sendChat(text.slice(0, chatMaxLength))
        }

        this.end()
    }

    private end(): void {
        this.active = false
        this.draft = ''
        this.emitState()
    }

    private emitState(): void {
        this.activity?.input(this.active && this.draft.trim().length > 0)
        this.onState({
            active: this.active,
            draft: this.draft,
            maxLength: chatMaxLength,
        })
    }
}

function isPrintableKey(event: KeyboardEvent): boolean {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

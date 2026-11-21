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
        sendActivity?: (command: SpeechActivityCommand) => void,
        private readonly onEnd?: () => void
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

    public suspend(): void {
        if (!this.active) return
        this.active = false
        this.emitState()
        this.onEnd?.()
    }

    public setDraft(text: string): void {
        const draft = text.slice(0, chatMaxLength)
        if (!this.active || draft === this.draft) return
        this.draft = draft
        this.emitState()
    }

    public handleKey(event: KeyboardEvent, sendChat: (text: string) => void): boolean {
        if (event.key === 'Enter') {
            event.preventDefault()
            if (event.repeat) return true

            if (this.active) {
                this.submit(sendChat)
            } else {
                this.begin()
            }

            return true
        }

        if (this.active && event.key === 'Escape') {
            event.preventDefault()
            this.end()
            return true
        }

        return false
    }

    private begin(): void {
        this.active = true
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
        const wasActive = this.active
        this.active = false
        this.draft = ''
        this.emitState()
        if (wasActive) this.onEnd?.()
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

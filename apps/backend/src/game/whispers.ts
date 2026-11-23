import {
    detectSpeechLanguage,
    type GameLocale,
    type LocalizedMessage,
    type PrivateSpeechSnapshot,
    type SpeechTranslation,
    type WhisperClientMessage,
    type WhisperSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { canHearSpeech } from './socialSpeech'

export const WHISPER_RANGE = 48

interface WhisperWorld {
    getCharacter(id: string): GameCharacter | undefined
    navigationFor(actor: GameCharacter): NavigationService
    heard(
        actor: GameCharacter,
        listener: GameCharacter,
        message: PrivateSpeechSnapshot
    ): void
    translate?(
        message: PrivateSpeechSnapshot,
        target: GameCharacter,
        keepOriginal: boolean,
        store: (translation: SpeechTranslation) => void
    ): void
}

interface WhisperSpeechOptions {
    language?: GameLocale
    keepOriginalForRecipient?: boolean
    textMessage?: LocalizedMessage
}

/** Histories belong to an exact pair; incoming speech never owns UI focus. */
export class WhisperService {
    private readonly partners = new Map<string, string>()
    private readonly selectedPartners = new Map<string, string>()
    private readonly histories = new Map<string, PrivateSpeechSnapshot[]>()
    private readonly translations = new WeakMap<
        PrivateSpeechSnapshot,
        SpeechTranslation
    >()
    private sequence = 0
    public constructor(private readonly world: WhisperWorld) {}

    public available(
        actor: GameCharacter,
        target: GameCharacter | undefined,
        now: number
    ): target is GameCharacter {
        return (
            target !== undefined &&
            actor.soul.canSpeak &&
            target.soul.canSpeak &&
            canHearSpeech(
                target,
                actor,
                this.world.navigationFor(actor),
                now,
                WHISPER_RANGE
            )
        )
    }

    public handle(
        actor: GameCharacter,
        command: WhisperClientMessage,
        now: number
    ): boolean {
        if (command.type === 'whisper_close') {
            this.partners.delete(actor.id)
            this.selectedPartners.delete(actor.id)
            return true
        }
        const target = this.world.getCharacter(command.targetId)
        if (!this.available(actor, target, now)) {
            return false
        }
        this.partners.set(actor.id, target.id)
        this.selectedPartners.set(actor.id, target.id)
        if (command.type === 'whisper') {
            return this.send(actor, target, command.text, now)
        }
        return true
    }

    public send(
        actor: GameCharacter,
        target: GameCharacter,
        text: string,
        now: number,
        options: WhisperSpeechOptions = {}
    ): boolean {
        text = text.trim().slice(0, 400)
        if (text.length === 0 || !this.available(actor, target, now)) {
            return false
        }
        const language = options.language ?? detectSpeechLanguage(text)
        const message: PrivateSpeechSnapshot = {
            id: `whisper:${String(++this.sequence)}`,
            senderId: actor.id,
            text,
            at: now,
            ...(language === undefined ? {} : { language }),
            ...(options.textMessage === undefined
                ? {}
                : { textMessage: options.textMessage }),
        }
        const key = this.key(actor.id, target.id)
        this.remember(key, message)
        this.partners.set(actor.id, target.id)
        this.partners.set(target.id, actor.id)
        this.selectedPartners.set(actor.id, target.id)
        // An incoming peer may notify an idle recipient, but cannot replace a conversation
        // already presented to them or discard the draft in that conversation's UI.
        if (!this.selectedPartners.has(target.id)) {
            this.selectedPartners.set(target.id, actor.id)
        }
        this.world.heard(actor, target, message)
        this.world.translate?.(
            message,
            target,
            options.keepOriginalForRecipient === true ||
                options.textMessage !== undefined,
            (translation) => {
                if (this.histories.get(key)?.includes(message) === true) {
                    this.translations.set(message, translation)
                }
            }
        )
        return true
    }

    private remember(key: string, message: PrivateSpeechSnapshot): void {
        const history = this.histories.get(key) ?? []
        history.push(message)
        this.histories.set(key, history.slice(-40))
        if (this.histories.size > 256) {
            const oldest = this.histories.keys().next().value
            if (oldest !== undefined) {
                this.histories.delete(oldest)
            }
        }
    }

    public snapshot(
        actor: GameCharacter,
        now: number,
        partnerId = this.selectedPartners.get(actor.id) ??
            this.partners.get(actor.id),
        projectTranslation = false
    ): WhisperSnapshot | null {
        const target =
            partnerId === undefined
                ? undefined
                : this.world.getCharacter(partnerId)
        if (target === undefined) {
            return null
        }
        return {
            partnerId: target.id,
            partnerName: target.nickname,
            available: this.available(actor, target, now),
            messages: (
                this.histories.get(this.key(actor.id, target.id)) ?? []
            ).map((message) =>
                this.project(message, actor.id, projectTranslation)
            ),
        }
    }

    public heardMessages(
        actorId: string,
        projectTranslation = false
    ): Array<import('@my-game-ratata/contracts').HeardPrivateSpeech> {
        return [...this.histories.entries()]
            .flatMap(([key, messages]) => {
                const pair = JSON.parse(key) as string[]
                if (!pair.includes(actorId)) {
                    return []
                }
                const partnerId = pair.find((id) => id !== actorId)
                const partner =
                    partnerId === undefined
                        ? undefined
                        : this.world.getCharacter(partnerId)
                if (partner === undefined) {
                    return []
                }
                return messages.map((message) => ({
                    ...this.project(message, actorId, projectTranslation),
                    partnerId: partner.id,
                    partnerName: partner.nickname,
                    senderName:
                        this.world.getCharacter(message.senderId)?.nickname ??
                        'Собеседник',
                }))
            })
            .sort((a, b) => a.at - b.at)
            .slice(-100)
    }

    private project(
        message: PrivateSpeechSnapshot,
        actorId: string,
        projectTranslation: boolean
    ): PrivateSpeechSnapshot {
        const translation =
            projectTranslation && actorId !== message.senderId
                ? this.translations.get(message)
                : undefined
        return {
            ...message,
            ...(translation === undefined
                ? {}
                : { translation: { ...translation } }),
        }
    }

    private key(left: string, right: string): string {
        return JSON.stringify([left, right].sort())
    }
}

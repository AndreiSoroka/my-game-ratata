import type {
    GameLocale,
    PrivateSpeechSnapshot,
    SpeechTranslation,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { type RoomSocket, send } from './roomMessaging'

export interface SpeechTranslator {
    translate(
        text: string,
        from: GameLocale,
        to: GameLocale
    ): Promise<string | undefined>
    stop?(): void
}

interface ConnectionLocale {
    locale: GameLocale
}

export interface SpeechRecipient {
    socket: RoomSocket
    preference: ConnectionLocale
    character: GameCharacter
    deathSequence: number
    locationId: string
}

const maxPendingPerSpeaker = 4
const maxRecentReceipts = 1024

/** Translations are presentation updates for the recipients of a resolved utterance. */
export class RoomSpeechTranslations {
    private readonly preferences = new WeakMap<RoomSocket, ConnectionLocale>()
    private readonly seen = new Set<string>()
    private readonly pending = new Map<string, number>()
    private active = true

    public constructor(
        private readonly connections: ReadonlyMap<
            RoomSocket,
            string | undefined
        >,
        private readonly getCharacter: (
            id: string
        ) => GameCharacter | undefined,
        private readonly translator: SpeechTranslator | undefined
    ) {}

    public joined(socket: RoomSocket, locale: GameLocale): void {
        this.preferences.set(socket, { locale })
    }

    public setLocale(socket: RoomSocket, locale: GameLocale): void {
        if (this.preferences.get(socket)?.locale !== locale) {
            this.joined(socket, locale)
        }
    }

    public localeFor(actorId: string): GameLocale {
        const socket = this.socketFor(actorId)
        return (
            (socket === undefined
                ? undefined
                : this.preferences.get(socket)?.locale) ?? 'ru'
        )
    }

    public recipient(
        socket: RoomSocket,
        character: GameCharacter
    ): SpeechRecipient | undefined {
        const preference = this.preferences.get(socket)
        if (
            preference === undefined ||
            this.translator === undefined ||
            !this.active
        ) {
            return undefined
        }
        return {
            socket,
            preference,
            character,
            deathSequence: character.deathSequence,
            locationId: character.locationId,
        }
    }

    public publish(
        actorId: string,
        speechId: number,
        text: string,
        language: GameLocale,
        recipients: SpeechRecipient[]
    ): void {
        const listeners = recipients.filter(
            ({ preference }) => preference.locale !== language
        )
        const locale = listeners[0]?.preference.locale
        const receipt = JSON.stringify([actorId, speechId])
        if (locale === undefined || this.seen.has(receipt)) {
            return
        }
        this.seen.add(receipt)
        if (this.seen.size > maxRecentReceipts) {
            const oldest = this.seen.values().next().value
            if (oldest !== undefined) {
                this.seen.delete(oldest)
            }
        }
        this.translate(actorId, text, language, locale, (translation) => {
            for (const listener of listeners) {
                if (this.current(listener)) {
                    send(listener.socket, {
                        type: 'speech_translation',
                        actorId,
                        speechId,
                        ...translation,
                    })
                }
            }
        })
    }

    public privateSpeech(
        message: PrivateSpeechSnapshot,
        target: GameCharacter,
        keepOriginal: boolean,
        store: (translation: SpeechTranslation) => void
    ): void {
        if (keepOriginal || message.language === undefined) {
            return
        }
        const socket = this.socketFor(target.id)
        const listener =
            socket === undefined ? undefined : this.recipient(socket, target)
        const locale = listener?.preference.locale
        if (
            listener === undefined ||
            locale === undefined ||
            locale === message.language
        ) {
            return
        }
        this.translate(
            message.senderId,
            message.text,
            message.language,
            locale,
            (translation) => {
                if (this.current(listener)) {
                    store(translation)
                }
            }
        )
    }

    public stop(): void {
        if (!this.active) {
            return
        }
        this.active = false
        this.seen.clear()
        this.translator?.stop?.()
    }

    private current(recipient: SpeechRecipient): boolean {
        const { socket, preference, character, deathSequence, locationId } =
            recipient
        return (
            this.active &&
            this.connections.get(socket) === character.id &&
            this.getCharacter(character.id) === character &&
            this.preferences.get(socket) === preference &&
            character.connected &&
            character.alive &&
            character.deathSequence === deathSequence &&
            character.locationId === locationId
        )
    }

    private socketFor(actorId: string): RoomSocket | undefined {
        for (const [socket, id] of this.connections) {
            if (id === actorId) {
                return socket
            }
        }
        return undefined
    }

    private translate(
        speaker: string,
        original: string,
        language: GameLocale,
        locale: GameLocale,
        deliver: (translation: SpeechTranslation) => void
    ): void {
        const translator = this.translator
        const pending = this.pending.get(speaker) ?? 0
        if (
            !this.active ||
            translator === undefined ||
            pending >= maxPendingPerSpeaker
        ) {
            return
        }
        this.pending.set(speaker, pending + 1)
        void Promise.resolve()
            .then(() =>
                this.active
                    ? translator.translate(original, language, locale)
                    : undefined
            )
            .then((result) => {
                const text = result?.trim()
                if (
                    text !== undefined &&
                    text.length > 0 &&
                    text !== original &&
                    text.length <= 1200
                ) {
                    deliver({ locale, text })
                }
            })
            .catch(() => {
                // The original is already delivered; translation failures never affect gameplay.
            })
            .finally(() => {
                const remaining = (this.pending.get(speaker) ?? 1) - 1
                if (remaining === 0) {
                    this.pending.delete(speaker)
                } else {
                    this.pending.set(speaker, remaining)
                }
            })
    }
}

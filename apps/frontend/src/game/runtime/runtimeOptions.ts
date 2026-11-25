import type {
    ClientMessage,
    GameEventPayload,
    HeroClass,
    SpeechTranslationServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { ChatInputState } from './chatInput'
import type { GraphicsRecoveryState } from './runtimeGraphicsRecovery'

export interface RatataGameOptions {
    container: HTMLElement
    nickname: string
    createOnly?: boolean
    requestResumeToken?: boolean
    resumeToken?: string
    heroClass?: HeroClass
    onCharacterClick?: (id: string) => void
    onCharacterDoubleClick?: (id: string) => void
    onCommand?: (message: ClientMessage) => void
    onEvent?: (event: GameEventPayload) => void
    onSpeechTranslation?: (translation: SpeechTranslationServerMessage) => void
    onChatState: (state: ChatInputState) => void
    onError: (message: string, code?: string) => void
    onResumeToken?: (nickname: string, token: string) => void
    onGraphicsRecovery?: (state: GraphicsRecoveryState | undefined) => void
    onMapError?: (message: string | null) => void
    onInventoryToggle: () => void
    onCharacterToggle?: () => void
    onContextAction?: () => void
    getChatTargetId?: () => string | undefined
    getChatFocusKey?: () => string | undefined
    onNotice?: (message: string) => void
    onDefeat?: () => void
    onSnapshot: (snapshot: WorldSnapshot, localPlayerId: string | undefined) => void
    onStatus: (message: string) => void
}

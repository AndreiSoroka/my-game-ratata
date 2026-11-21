import type {
    ClientMessage,
    GameEventPayload,
    HeroClass,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { ChatInputState } from './chatInput'

export interface RatataGameOptions {
    container: HTMLElement
    nickname: string
    createOnly?: boolean
    heroClass?: HeroClass
    onCharacterClick?: (id: string) => void
    onCharacterDoubleClick?: (id: string) => void
    onCommand?: (message: ClientMessage) => void
    onEvent?: (event: GameEventPayload) => void
    onChatState: (state: ChatInputState) => void
    onError: (message: string) => void
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

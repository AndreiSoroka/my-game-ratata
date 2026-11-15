import type { GameEventPayload, HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'

import type { ChatInputState } from './chatInput'

export interface RatataGameOptions {
    container: HTMLElement
    nickname: string
    heroClass?: HeroClass
    onCharacterClick?: (id: string) => void
    onEvent?: (event: GameEventPayload) => void
    onChatState: (state: ChatInputState) => void
    onError: (message: string) => void
    onInventoryToggle: () => void
    onCharacterToggle?: () => void
    onContextAction?: () => void
    onNotice?: (message: string) => void
    onDefeat?: () => void
    onSnapshot: (snapshot: WorldSnapshot, localPlayerId: string | undefined) => void
    onStatus: (message: string) => void
}

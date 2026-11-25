import type { InjectionKey } from 'vue'

import type { UiSoundId } from '../../../game/assets/soundCatalog'

export const gameUiSoundKey: InjectionKey<(id: UiSoundId) => void> = Symbol('game UI sound')

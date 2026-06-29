export const gameSoundIds = [
    'attack',
    'chestOpen',
    'drink',
    'drop',
    'equip',
    'hit',
    'move',
    'pickup',
    'stash',
    'ui',
] as const

export type GameSoundId = (typeof gameSoundIds)[number]

export interface SoundAssetDefinition {
    src: string
    volume: number
}

export interface MusicAssetDefinition extends SoundAssetDefinition {
    loop: boolean
}

const sfxRoot = '/game/assets/audio/sfx'
const musicRoot = '/game/assets/audio/music'

export const soundCatalog: Record<GameSoundId, SoundAssetDefinition> = {
    attack: sfx('attack-swing.wav', 0.42),
    chestOpen: sfx('chest-open.wav', 0.45),
    drink: sfx('drink.wav', 0.35),
    drop: sfx('pickup-drop.wav', 0.28),
    equip: sfx('equip.wav', 0.32),
    hit: sfx('attack-hit.wav', 0.34),
    move: sfx('movement-step.wav', 0.12),
    pickup: sfx('pickup-drop.wav', 0.24),
    stash: sfx('chest-open.wav', 0.24),
    ui: sfx('ui-toggle.wav', 0.25),
}

export const musicCatalog = {
    adventureBegins: {
        loop: true,
        src: `${musicRoot}/adventure-begins.ogg`,
        volume: 0.18,
    },
} as const satisfies Record<string, MusicAssetDefinition>

function sfx(fileName: string, volume: number): SoundAssetDefinition {
    return {
        src: `${sfxRoot}/${fileName}`,
        volume,
    }
}

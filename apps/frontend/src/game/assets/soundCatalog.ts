export const gameSoundIds = [
    'attack',
    'chestOpen',
    'drink',
    'drop',
    'equip',
    'hit',
    'slimeHop',
    'stepGrass0',
    'stepGrass1',
    'stepGrass2',
    'stepStone0',
    'stepStone1',
    'stepStone2',
    'stepWood0',
    'stepWood1',
    'stepWood2',
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
    slimeHop: sfx('slime-hop.wav', 0.1),
    stepGrass0: { src: '/game/assets/audio/kenney-impact/footstep_grass_000.ogg', volume: 0.19 },
    stepGrass1: { src: '/game/assets/audio/kenney-impact/footstep_grass_001.ogg', volume: 0.19 },
    stepGrass2: { src: '/game/assets/audio/kenney-impact/footstep_grass_002.ogg', volume: 0.19 },
    stepStone0: { src: '/game/assets/audio/kenney-impact/footstep_concrete_000.ogg', volume: 0.23 },
    stepStone1: { src: '/game/assets/audio/kenney-impact/footstep_concrete_001.ogg', volume: 0.23 },
    stepStone2: { src: '/game/assets/audio/kenney-impact/footstep_concrete_002.ogg', volume: 0.23 },
    stepWood0: { src: '/game/assets/audio/kenney-impact/footstep_wood_000.ogg', volume: 0.2 },
    stepWood1: { src: '/game/assets/audio/kenney-impact/footstep_wood_001.ogg', volume: 0.2 },
    stepWood2: { src: '/game/assets/audio/kenney-impact/footstep_wood_002.ogg', volume: 0.2 },
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

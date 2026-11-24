const uiSoundIds = [
    'uiOpen',
    'uiClose',
    'uiSelect',
    'uiSlotSelect',
    'uiClick',
    'uiConfirmation',
    'masteryUp',
] as const

export type UiSoundId = (typeof uiSoundIds)[number]

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
    ...uiSoundIds,
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
const interfaceRoot = '/game/assets/audio/kenney-interface'
const uiAudioRoot = '/game/assets/audio/kenney-ui-audio'

export const soundCatalog: Record<GameSoundId, SoundAssetDefinition> = {
    attack: sfx('attack-swing.wav', 0.42),
    chestOpen: sfx('chest-open.wav', 0.45),
    drink: sfx('drink.wav', 0.35),
    drop: sfx('pickup-drop.wav', 0.28),
    equip: { src: `${uiAudioRoot}/switch11.ogg`, volume: 0.24 },
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
    uiOpen: { src: '/game/assets/audio/kenney-rpg-audio/bookPlace1.ogg', volume: 0.12 },
    uiClose: { src: `${interfaceRoot}/close_001.ogg`, volume: 0.18 },
    uiSelect: { src: `${interfaceRoot}/select_001.ogg`, volume: 0.12 },
    uiSlotSelect: { src: `${uiAudioRoot}/rollover2.ogg`, volume: 0.12 },
    uiClick: { src: `${interfaceRoot}/click_001.ogg`, volume: 0.16 },
    uiConfirmation: { src: `${interfaceRoot}/confirmation_001.ogg`, volume: 0.22 },
    masteryUp: { src: '/game/assets/audio/kenney-jingles/jingles_PIZZI04.ogg', volume: 0.22 },
}

export const musicCatalog = {
    adventureBegins: {
        loop: true,
        src: `${musicRoot}/adventure-begins.ogg`,
        volume: 0.108,
    },
    forestBattle: {
        loop: true,
        src: `${musicRoot}/Kingslayer_at_the_Clockwork_Gate.mp3`,
        volume: 0.04,
    },
} as const satisfies Record<string, MusicAssetDefinition>

function sfx(fileName: string, volume: number): SoundAssetDefinition {
    return {
        src: `${sfxRoot}/${fileName}`,
        volume,
    }
}

export const characterIds = [
    'player',
    'male_player_2',
    'male_mage',
    'female_player',
    'female_mage',
    'zombie',
    'zombie_mage',
    'skeleton',
    'skeleton_mace',
    'skeleton_swordless',
    'slime',
] as const

export const characterActions = ['idle', 'walk', 'attack', 'damaged', 'death'] as const

export const characterDirections = ['down', 'right', 'left', 'up'] as const

export type CharacterId = (typeof characterIds)[number]
export type CharacterAction = (typeof characterActions)[number]
export type CharacterDirection = (typeof characterDirections)[number]

export interface DirectionalRows {
    down: number
    right: number
    up: number
}

export interface DirectionalAnimation {
    frameCount: number
    frameMs: number
    rows: DirectionalRows
}

export interface SingleRowAnimation {
    frameCount: number
    frameMs: number
    row: number
}

export type CharacterAnimation = DirectionalAnimation | SingleRowAnimation | undefined

export interface CharacterDefinition {
    animations: Record<CharacterAction, CharacterAnimation>
    columns: number
    id: CharacterId
    label: string
    rows: number
    spriteHeight: number
    spriteWidth: number
    src: string
}

const defaultFrameMs = 160
const moveFrameMs = 120
const attackFrameMs = 90
const damagedFrameMs = 140
const deathFrameMs = 180

const playerAnimations: CharacterDefinition['animations'] = {
    idle: {
        rows: { down: 0, right: 1, up: 2 },
        frameCount: 4,
        frameMs: defaultFrameMs,
    },
    walk: {
        rows: { down: 3, right: 4, up: 5 },
        frameCount: 6,
        frameMs: moveFrameMs,
    },
    attack: {
        rows: { down: 6, right: 7, up: 8 },
        frameCount: 4,
        frameMs: attackFrameMs,
    },
    damaged: undefined,
    death: {
        row: 9,
        frameCount: 5,
        frameMs: deathFrameMs,
    },
}

const enemyAnimations: CharacterDefinition['animations'] = {
    idle: {
        rows: { down: 0, right: 1, up: 2 },
        frameCount: 4,
        frameMs: defaultFrameMs,
    },
    walk: {
        rows: { down: 3, right: 4, up: 5 },
        frameCount: 6,
        frameMs: moveFrameMs,
    },
    attack: {
        rows: { down: 6, right: 7, up: 8 },
        frameCount: 6,
        frameMs: attackFrameMs,
    },
    damaged: {
        rows: { down: 9, right: 10, up: 11 },
        frameCount: 3,
        frameMs: damagedFrameMs,
    },
    death: {
        row: 12,
        frameCount: 5,
        frameMs: deathFrameMs,
    },
}

export const characterCatalog: Record<CharacterId, CharacterDefinition> = {
    player: {
        animations: playerAnimations,
        columns: 7,
        id: 'player',
        label: 'Human',
        rows: 10,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/player.png',
    },
    male_player_2: {
        animations: playerAnimations,
        columns: 7,
        id: 'male_player_2',
        label: 'Human Male 2',
        rows: 10,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/male_player_2.png',
    },
    male_mage: {
        animations: playerAnimations,
        columns: 7,
        id: 'male_mage',
        label: 'Human Male Mage',
        rows: 10,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/male_mage.png',
    },
    female_player: {
        animations: playerAnimations,
        columns: 7,
        id: 'female_player',
        label: 'Human Female',
        rows: 10,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/female_player.png',
    },
    female_mage: {
        animations: playerAnimations,
        columns: 7,
        id: 'female_mage',
        label: 'Human Female Mage',
        rows: 10,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/female_mage.png',
    },
    zombie: {
        animations: enemyAnimations,
        columns: 6,
        id: 'zombie',
        label: 'Zombie',
        rows: 13,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/zombie.png',
    },
    zombie_mage: {
        animations: enemyAnimations,
        columns: 6,
        id: 'zombie_mage',
        label: 'Zombie Mage',
        rows: 13,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/zombie_mage.png',
    },
    skeleton: {
        animations: enemyAnimations,
        columns: 6,
        id: 'skeleton',
        label: 'Skeleton',
        rows: 13,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/skeleton.png',
    },
    skeleton_mace: {
        animations: enemyAnimations,
        columns: 6,
        id: 'skeleton_mace',
        label: 'Skeleton Mace',
        rows: 13,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/skeleton_mace.png',
    },
    skeleton_swordless: {
        animations: enemyAnimations,
        columns: 6,
        id: 'skeleton_swordless',
        label: 'Skeleton Swordless',
        rows: 13,
        spriteHeight: 48,
        spriteWidth: 48,
        src: '/game/assets/characters/skeleton_swordless.png',
    },
    slime: {
        animations: enemyAnimations,
        columns: 7,
        id: 'slime',
        label: 'Slime',
        rows: 13,
        spriteHeight: 32,
        spriteWidth: 32,
        src: '/game/assets/characters/slime.png',
    },
}

export function isDirectionalAnimation(
    animation: CharacterAnimation
): animation is DirectionalAnimation {
    return animation !== undefined && 'rows' in animation
}

export function resolveAnimationRow(
    animation: CharacterAnimation,
    direction: CharacterDirection
): number | undefined {
    if (animation === undefined) {
        return undefined
    }

    if (!isDirectionalAnimation(animation)) {
        return animation.row
    }

    if (direction === 'left') {
        return animation.rows.right
    }

    return animation.rows[direction]
}

export function clampFrame(animation: CharacterAnimation, frame: number): number {
    if (animation === undefined) {
        return 0
    }

    return Math.max(0, Math.min(animation.frameCount - 1, Math.trunc(frame)))
}

export function supportsDirection(
    animation: CharacterAnimation,
    direction: CharacterDirection
): boolean {
    return isDirectionalAnimation(animation) || direction === 'down'
}

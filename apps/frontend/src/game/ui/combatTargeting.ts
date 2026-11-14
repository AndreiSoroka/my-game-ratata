import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { gameKeyBlocked, worldKeyboardOwned } from './keyboardOwnership'

export function relation(
    character: CharacterSnapshot,
    player: CharacterSnapshot
): 'self' | 'friendly' | 'hostile' {
    return character.id === player.id
        ? 'self'
        : (character.relationship ??
              (character.faction === player.faction ? 'friendly' : 'hostile'))
}
export function selectableTargets(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot,
    allies: boolean
): CharacterSnapshot[] {
    return characters
        .filter(
            (character) =>
                character.id !== player.id &&
                !character.tags.includes('offline') &&
                (character.alive || (allies && (character.life?.reviveMsLeft ?? 0) > 0)) &&
                attackableTarget(character, player) === !allies
        )
        .sort(
            (a, b) =>
                Math.hypot(a.position.x - player.position.x, a.position.y - player.position.y) -
                    Math.hypot(
                        b.position.x - player.position.x,
                        b.position.y - player.position.y
                    ) || a.id.localeCompare(b.id)
        )
}
export function nextTarget(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot,
    currentId: string | undefined,
    allies: boolean
): string | undefined {
    const candidates = selectableTargets(characters, player, allies)
    const index = candidates.findIndex((character) => character.id === currentId)
    return candidates[(index + 1) % candidates.length]?.id
}
export function combatInputBlocked(): boolean {
    return worldKeyboardOwned()
}

export function combatKeyBlocked(event: KeyboardEvent, blocked: boolean): boolean {
    return blocked || gameKeyBlocked(event)
}

export function attackableTarget(character: CharacterSnapshot, player: CharacterSnapshot): boolean {
    return character.trainingTarget !== undefined || relation(character, player) === 'hostile'
}

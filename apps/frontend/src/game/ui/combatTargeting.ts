import type { CharacterSnapshot } from '@my-game-ratata/contracts'

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
                (relation(character, player) !== 'hostile') === allies
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
    const focus = document.activeElement
    return (
        document.querySelector('[role="dialog"], [role="menu"]') !== null ||
        (focus instanceof HTMLElement &&
            focus.closest('input,textarea,select,button,[contenteditable="true"]') !== null)
    )
}

export function combatKeyBlocked(event: KeyboardEvent, blocked: boolean): boolean {
    return blocked || combatInputBlocked() || event.ctrlKey || event.metaKey || event.altKey
}

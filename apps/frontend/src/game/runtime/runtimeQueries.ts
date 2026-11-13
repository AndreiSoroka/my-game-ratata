import type {
    CharacterSnapshot,
    GameEventPayload,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

export function isDialogueCharacter(character: CharacterSnapshot): boolean {
    return (
        character.alive &&
        character.faction === 'peaceful' &&
        character.controllerKind !== 'network_player' &&
        character.soul?.canSpeak === true
    )
}

export function nearestDialogueCharacter(
    snapshot: WorldSnapshot | undefined,
    localPlayerId: string | undefined,
    isVisible: (id: string) => boolean = () => true
): CharacterSnapshot | undefined {
    const player = snapshot?.characters.find((character) => character.id === localPlayerId)
    if (player === undefined || !player.alive) return undefined
    return snapshot?.characters
        .filter((character) => isDialogueCharacter(character) && isVisible(character.id))
        .map((character) => ({
            character,
            distance: distance(character.position, player.position),
        }))
        .filter((candidate) => candidate.distance <= 48)
        .sort((a, b) => a.distance - b.distance)[0]?.character
}

export function shouldAttackAt(
    snapshot: WorldSnapshot | undefined,
    localPlayerId: string | undefined,
    point: Vector2
): boolean {
    return (
        snapshot?.characters.some(
            (character) =>
                character.id !== localPlayerId &&
                character.alive &&
                distance(character.position, point) <= 24
        ) ?? false
    )
}

export function isEditableTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLButtonElement ||
            target.closest('[role="menu"], [role="dialog"], .adventure-window, .speech-text') !==
                null ||
            target.isContentEditable)
    )
}

export function isNoticeForPlayer(
    event: GameEventPayload,
    playerId: string | undefined
): event is GameEventPayload & { text: string } {
    return (
        event.kind === 'notice' &&
        event.text !== undefined &&
        (event.actorId === undefined || event.actorId === playerId)
    )
}

export function isChatEvent(
    event: GameEventPayload
): event is GameEventPayload & { actorId: string; text: string } {
    return event.kind === 'chat' && event.actorId !== undefined && event.text !== undefined
}

function distance(first: Vector2, second: Vector2): number {
    return Math.hypot(first.x - second.x, first.y - second.y)
}

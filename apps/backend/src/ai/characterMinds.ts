import { CharacterMemory } from './characterMemory'

const identityMemories = new WeakMap<
    import('../game/character').GameCharacter,
    CharacterMemory
>()
export function peekMemoryForCharacter(
    actor: import('../game/character').GameCharacter
): CharacterMemory | undefined {
    return identityMemories.get(actor)
}
export function memoryForCharacter(
    actor: import('../game/character').GameCharacter
): CharacterMemory {
    let memory = identityMemories.get(actor)
    if (memory === undefined) {
        memory = new CharacterMemory(actor.id)
        identityMemories.set(actor, memory)
    }
    return memory
}

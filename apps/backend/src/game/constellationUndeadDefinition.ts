import { type ConstellationStar, star } from './constellationDefinition'

export function undeadStar(
    id: string,
    name: string,
    description: string,
    minimumLevel: number,
    parent: string
): ConstellationStar {
    return {
        ...star('undead', id, name, description, [parent]),
        minimumLevel,
    }
}

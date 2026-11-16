import {
    type AuthoredContainerDefinition,
    type ContainerContentsDefinition,
    ITEM_DEFINITIONS,
} from '@my-game-ratata/contracts'

interface PropertyObject {
    x?: number
    y?: number
    width?: number
    height?: number
    properties?: Array<{ name: string; value: unknown }>
}
export function readAuthoredContainer(
    source: PropertyObject,
    object: {
        id: string
        name: string
        bounds: AuthoredContainerDefinition['bounds']
    },
    map: { layers: Array<{ name: string; objects?: PropertyObject[] }> }
): AuthoredContainerDefinition {
    const get = (name: string) =>
        source.properties?.find((entry) => entry.name === name)?.value
    const propId = get('propId')
    const encoded = get('contents')
    const linked = map.layers
        .find((layer) => layer.name === 'Depth props')
        ?.objects?.find(
            (prop) =>
                prop.properties?.some(
                    (entry) => entry.name === 'propId' && entry.value === propId
                ) === true
        )
    if (
        typeof propId !== 'string' ||
        propId.length === 0 ||
        linked === undefined ||
        typeof encoded !== 'string'
    ) {
        throw new Error(`Invalid container metadata: ${object.id}`)
    }
    if (!sameBounds(linked, object.bounds)) {
        throw new Error(`Container geometry differs from prop: ${object.id}`)
    }
    const contents: unknown = JSON.parse(encoded)
    if (
        !Array.isArray(contents) ||
        contents.length > 50 ||
        !contents.every(validContents)
    ) {
        throw new Error(`Invalid container contents: ${object.id}`)
    }
    return {
        id: object.id,
        kind: 'barrel',
        title: object.name,
        propId,
        bounds: { ...object.bounds },
        contents,
    }
}
function sameBounds(
    prop: PropertyObject,
    bounds: AuthoredContainerDefinition['bounds']
): boolean {
    return (
        prop.x === bounds.x &&
        prop.y === bounds.y &&
        prop.width === bounds.width &&
        prop.height === bounds.height
    )
}
function validContents(value: unknown): value is ContainerContentsDefinition {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    const entry = value as Record<string, unknown>
    return (
        typeof entry['itemId'] === 'string' &&
        Object.hasOwn(ITEM_DEFINITIONS, entry['itemId']) &&
        typeof entry['quantity'] === 'number' &&
        Number.isInteger(entry['quantity']) &&
        entry['quantity'] > 0 &&
        entry['quantity'] <= 50
    )
}

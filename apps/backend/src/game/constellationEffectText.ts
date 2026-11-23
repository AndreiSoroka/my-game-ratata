import type { ConstellationStar } from './constellationCatalog'
import { constellationEnglishText } from './constellationEnglishText'
import { fullConstellationCatalog } from './constellationNodes'
import { constellationStaticEffectEnglish } from './constellationStaticEffectEnglish'

export type EffectRow = readonly [russian: string, english: string]
const nodes = new Map(fullConstellationCatalog.map((node) => [node.id, node]))

export function effectRow(russian: string, english: string): EffectRow {
    return [russian, english]
}

export function appendLearnedEffect(
    effects: EffectRow[],
    learned: ReadonlySet<string>,
    id: string
): void {
    const node = nodes.get(id)
    if (learned.has(id) && node !== undefined) {
        effects.push(
            ...(node.results ?? [node.description]).map((text) =>
                authoredEffectRow(node, text)
            )
        )
    }
}

export function authoredEffectRow(
    node: ConstellationStar,
    text: string
): EffectRow {
    const index = [...(node.results ?? []), ...(node.effects ?? [])]
        .filter((row) => row !== node.description)
        .indexOf(text)
    const translated =
        text === node.description
            ? constellationEnglishText[node.id]?.[1]
            : constellationStaticEffectEnglish[node.id]?.[index]
    return effectRow(text, translated ?? text)
}

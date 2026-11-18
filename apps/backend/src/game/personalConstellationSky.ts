import { randomBytes } from 'node:crypto'

import type { ConstellationId, HeroClass } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { generateConstellationLayout } from './constellationLayout'
import { fullConstellationCatalog } from './constellationNodes'

type RealizedLayout = ReturnType<typeof generateConstellationLayout>
type Immutable<T> = { readonly [Key in keyof T]: Immutable<T[Key]> }
export type CachedConstellationLayout = Immutable<RealizedLayout>

/** Identity-owned private data. Neither the seed nor the complete hidden graph is serialized. */
export class PersonalConstellationSky {
    readonly #seed = randomBytes(16).toString('hex')
    readonly #background: { readonly heroClass: HeroClass | undefined }
    #layout: CachedConstellationLayout | undefined
    #catalogVersion: string | undefined

    public constructor(background: {
        readonly heroClass: HeroClass | undefined
    }) {
        this.#background = background
    }

    public prepare(): CachedConstellationLayout {
        const version = catalogVersion()
        if (this.#catalogVersion !== version) {
            this.#layout = undefined
            this.#catalogVersion = version
        }
        this.#layout ??= freezeLayout(
            generateConstellationLayout(
                fullConstellationCatalog,
                this.#seed,
                startingConstellation(this.#background.heroClass)
            )
        )
        return this.#layout
    }

    public read(): CachedConstellationLayout | undefined {
        return this.#layout
    }
}

function startingConstellation(
    heroClass: HeroClass | undefined
): ConstellationId {
    return heroClass === undefined
        ? 'life'
        : {
              vanguard: 'blade' as const,
              arcanist: 'magic' as const,
              cleric: 'prayer' as const,
              ranger: 'arrow' as const,
          }[heroClass]
}

function freezeLayout<T>(value: T): Immutable<T> {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) {
            freezeLayout(child)
        }
        Object.freeze(value)
    }
    return value
}

/** Prewarm outside simulation ticks, before granting an authorized private observation. */
export function prepareConstellationLayout(
    actor: GameCharacter
): CachedConstellationLayout {
    return actor.constellationSky.prepare()
}

/** Snapshot reads never generate geometry, consume gameplay randomness or mutate identity state. */
export function readCachedConstellationLayout(
    actor: GameCharacter
): CachedConstellationLayout | undefined {
    return actor.constellationSky.read()
}

function catalogVersion(): string {
    return (
        'blade-and-results-v2|' +
        fullConstellationCatalog
            .map((node) => `${node.id}:${node.parents.join(',')}`)
            .join('|')
    )
}

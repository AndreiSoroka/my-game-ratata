import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'

import { gameLocale, masteryName, tGame, tLocalized } from '@/shared/lib/i18n'

/** Compare only the owner's private sky; learned opaque IDs remain seen across partial snapshots. */
export function createConstellationNotices() {
    let session = ''
    let initialized = false
    let sequence = 0
    const paths = new Set<string>()
    const stars = new Set<string>()
    return {
        observe(snapshot: WorldSnapshot, playerId: string | undefined) {
            if (playerId === undefined) return undefined
            const identity = JSON.stringify([snapshot.serverEpoch ?? '', playerId])
            if (identity !== session) {
                session = identity
                initialized = false
                paths.clear()
                stars.clear()
            }
            const actor = snapshot.characters.find((character) => character.id === playerId)
            const sky = actor?.progression?.constellations
            if (actor === undefined || sky === undefined) return undefined
            const learnedPaths = sky.paths.filter((path) => path.unlocked)
            const learnedStars = sky.nodes.filter((star) => star.unlocked)
            const newPaths = learnedPaths.filter((path) => !paths.has(path.id) && path.name)
            const newStars = learnedStars.filter(
                (star) =>
                    !stars.has(star.id) &&
                    star.kind !== 'root' &&
                    star.parents.length > 0 &&
                    star.name
            )
            learnedPaths.forEach((path) => paths.add(path.id))
            learnedStars.forEach((star) => stars.add(star.id))
            if (!initialized) {
                initialized = true
                return undefined
            }
            if (!canAnnounce(actor)) return undefined
            const text = [
                describe(
                    'constellation',
                    newPaths.map((path) =>
                        gameLocale.value === 'ru' ? path.name! : masteryName(path.id)
                    )
                ),
                describe(
                    'star',
                    newStars.map((star) => tLocalized(star.nameMessage, star.name!))
                ),
            ]
                .filter(Boolean)
                .join(' ')
            return text
                ? { notice: text, noticeId: `constellation:${session}:${++sequence}` }
                : undefined
        },
    }
}

function canAnnounce(actor: CharacterSnapshot): boolean {
    return actor.alive && actor.life?.retired !== true
}

function describe(kind: 'star' | 'constellation', names: string[]): string {
    if (names.length === 0) return ''
    const list = names
        .map((name) => (gameLocale.value === 'ru' ? `«${name}»` : `“${name}”`))
        .join(', ')
    const subject = names.length === 1 ? kind : (`${kind}s` as const)
    return tGame(`game.knowledge.${subject}Unlocked`, { names: list })
}

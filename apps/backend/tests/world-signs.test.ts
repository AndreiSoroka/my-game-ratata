import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

interface AuthoredSign {
    name: string
    type: string
    properties: Array<{ name: string; value: string }>
}
interface AuthoredMap {
    layers: Array<{ name: string; objects?: AuthoredSign[] }>
}
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
function signs(id: string): AuthoredSign[] {
    const map = JSON.parse(
        fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
    ) as AuthoredMap
    return (
        map.layers
            .find((layer) => layer.name === 'World interactions')
            ?.objects?.filter((object) => object.type === 'sign') ?? []
    )
}
function body(sign: AuthoredSign | undefined): string {
    return (
        sign?.properties.find((property) => property.name === 'text')?.value ??
        ''
    )
}

describe('authored sign readings', () => {
    it('keeps every reading concise without repeating its title or generic region advice', () => {
        for (const location of WORLD_LOCATION_DEFINITIONS) {
            const readings = signs(location.id)
            expect(readings.length).toBeGreaterThanOrEqual(5)
            for (const sign of readings) {
                const text = body(sign)
                expect(text.length).toBeGreaterThan(10)
                expect(text.length).toBeLessThanOrEqual(100)
                expect(text.startsWith(`${sign.name}.`)).toBe(false)
                expect(text).not.toMatch(
                    /Земли Новогорода|держитесь вместе|четырёх предместьях/
                )
                expect(
                    text.split(/[.!?]/u).filter(Boolean).length
                ).toBeLessThanOrEqual(2)
            }
        }
    })
    it('points to the real adjacent location and marks only the outer edge with dragons', () => {
        const directions = [
            { name: 'Восточный путь', dx: 1, dy: 0 },
            { name: 'Западный путь', dx: -1, dy: 0 },
            { name: 'Северный путь', dx: 0, dy: -1 },
            { name: 'Южный путь', dx: 0, dy: 1 },
        ]
        for (const location of WORLD_LOCATION_DEFINITIONS) {
            for (const direction of directions) {
                const sign = signs(location.id).find(
                    (item) => item.name === direction.name
                )
                expect(sign).toBeDefined()
                const neighbor = WORLD_LOCATION_DEFINITIONS.find(
                    (item) =>
                        item.column === location.column + direction.dx &&
                        item.row === location.row + direction.dy
                )
                expect(body(sign)).toContain(neighbor?.name ?? 'живут драконы')
            }
        }
    })
    it('gives distinct city destinations and real chapel, library and tavern services', () => {
        const city = signs(CENTER_LOCATION_ID)
        const texts = city.map(body)
        expect(new Set(texts).size).toBe(texts.length)
        const textFor = (name: string): string =>
            body(city.find((sign) => sign.name === name))
        expect(textFor('Часовня памяти')).toContain('30 золотых')
        expect(textFor('Часовня памяти')).not.toMatch(/исцел|лечит/iu)
        expect(textFor('Городская библиотека')).toContain('Арен')
        expect(textFor('Таверна «Три дороги»')).toContain('Бран и Лея')
        expect(signs('map1')).toEqual(city)
    })
})

import { expect, it } from 'vitest'

import {
    knowledgeCorpus,
    parseKnowledgeArticle,
} from '../src/ai/knowledgeCorpus'
import {
    knowledgeFactValues,
    validateKnowledgeFacts,
} from '../src/ai/knowledgeFacts'

function assertion(id: string, value: number, prose = String(value)) {
    return parseKnowledgeArticle(`# Проверка\n${prose}\n`, {
        id: 'test.assertion',
        file: 'test/assertion.md',
        audiences: ['common'],
        facts: { [id]: value },
    })
}

it('checks corpus assertions against actual yields, costs, condition and farm rules', () => {
    const articles = knowledgeCorpus()
    expect(articles.length).toBeGreaterThan(30)
    for (const article of articles) {
        expect(article.sources.length, article.id).toBeGreaterThan(0)
        expect(article.checks.length, article.id).toBeGreaterThan(0)
    }
    expect(() => validateKnowledgeFacts(articles)).not.toThrow()
    expect(knowledgeFactValues()).toMatchObject({
        'forestry.adult.wood': 8,
        'forestry.adult.saplings': 2,
        'forestry.adult.brushwood': 1,
        'forestry.small.wood': 2,
        'forestry.small.saplings': 0,
        'forestry.small.brushwood': 1,
    })
})

it('rejects stale quantities instead of accepting a second rule source', () => {
    expect(() =>
        validateKnowledgeFacts([assertion('forestry.adult.wood', 5)])
    ).toThrow('rules give 8')
    expect(() =>
        validateKnowledgeFacts([assertion('imaginary.quantity', 5)])
    ).toThrow('unknown knowledge fact')
})

it('requires asserted quantities in the prose and accepts explicit seconds or minutes', () => {
    expect(() =>
        validateKnowledgeFacts([
            assertion(
                'equipment.axe.condition',
                1000,
                'Прочность 1000, затем ремонт.'
            ),
            assertion(
                'forestry.axe.durationMs',
                2000,
                'Один удар раз в 2 секунды.'
            ),
            assertion('forestry.growthMs', 600_000, 'Рост занимает 10 минут.'),
        ])
    ).not.toThrow()
    expect(() =>
        validateKnowledgeFacts([
            assertion('forestry.adult.wood', 8, 'Выходит 5 древесины.'),
        ])
    ).toThrow('absent from its prose')
})

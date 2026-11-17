import type { GameCharacter } from '../game/character'
import {
    characterKnowledgeAudiences,
    hasKnowledgeAudience,
} from './knowledgeAudiences'
import { knowledgeCorpus } from './knowledgeCorpus'

export interface NpcKnowledgeScope {
    topics: string[]
    expertise: string[]
    canSearch: boolean
    lookupsRemaining: 0 | 1
}

const topicNames: Readonly<Record<string, string>> = {
    body: 'Здоровье и силы',
    combat: 'Бой и опасности',
    crafting: 'Ремесло и заказы',
    creatures: 'Существа',
    development: 'Обучение и развитие',
    economy: 'Торговля и городское хозяйство',
    equipment: 'Снаряжение и ремонт',
    faith: 'Молитвы и покровители',
    farming: 'Земледелие',
    forestry: 'Лес и древесина',
    inventory: 'Вещи и хранение',
    law: 'Городской закон',
    life: 'Смерть, спасение и могилы',
    mining: 'Камень и добыча',
    person: 'Личные сведения',
    quests: 'Поручения и награды',
    city: 'Местные жители и службы',
    social: 'Общение и совместные дела',
    work: 'Работа и помощь городу',
    world: 'Дороги и земли',
}
const expertiseNames: Readonly<Record<string, string>> = {
    'profession:lumberjack': 'Лесное дело',
    'profession:miner': 'Добыча камня',
    'profession:farmer': 'Земледелие',
    'profession:smith': 'Кузнечное дело',
    'profession:weaver': 'Ткачество',
    'profession:baker': 'Пекарское дело',
    'profession:merchant': 'Торговля',
    'profession:guard': 'Городская стража',
    'doctrine:prayer': 'Молитвенное учение',
    'doctrine:magic': 'Магическое учение',
}

/** A small menu of permitted subjects, not an article catalogue or a grant of skill. */
export function characterKnowledgeScope(
    actor: GameCharacter,
    canSearch = true
): NpcKnowledgeScope {
    const audiences = characterKnowledgeAudiences(actor)
    const topics = new Set<string>()
    for (const article of knowledgeCorpus()) {
        if (hasKnowledgeAudience(audiences, article.audiences)) {
            const topic = topicNames[article.id.split(/[.:-]/u)[0] ?? '']
            if (topic !== undefined) {
                topics.add(topic)
            }
        }
    }
    return {
        topics: [...topics].sort((a, b) => a.localeCompare(b, 'ru')),
        expertise: Object.entries(expertiseNames)
            .filter(([audience]) => audiences.has(audience))
            .map(([, name]) => name),
        canSearch,
        lookupsRemaining: canSearch ? 1 : 0,
    }
}

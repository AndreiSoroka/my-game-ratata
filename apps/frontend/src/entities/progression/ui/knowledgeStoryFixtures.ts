import type { KnowledgeParticipant } from '../model/knowledgeParticipant'

export const scholar: KnowledgeParticipant = {
    id: 'scholar',
    nickname: 'Арис',
    faction: 'peaceful',
    alive: true,
    tags: ['scholar'],
    position: { x: 16, y: 0 },
}
export const apprentice: KnowledgeParticipant = {
    id: 'apprentice',
    nickname: 'Новик',
    faction: 'peaceful',
    alive: true,
    tags: [],
    position: { x: 0, y: 0 },
    abilities: { known: [], cooldowns: {}, barrier: null, casting: null },
    progression: {
        masteries: [
            {
                id: 'magic',
                name: 'Магия',
                level: 3,
                experience: '12.875',
                experienceToNext: '175',
                totalExperience: '540',
                pendingOpenings: 1,
                conflictMultiplier: 1,
            },
        ],
        deity: {
            id: 'hearth',
            name: 'Угольная Мать',
            domain: 'Домашний очаг',
            omen: 'Пламя горит ровно.',
            perception: 'clear',
            mood: 'neutral',
            successChance: 0.48,
            changesInMs: 60_000,
        },
        magicChaptersRead: 1,
        magicChaptersTotal: 3,
        resurrectionUnlocked: false,
    },
}

export const caster: KnowledgeParticipant = {
    ...apprentice,
    abilities: { known: ['spark', 'fireball'], cooldowns: {}, barrier: null, casting: null },
}
export const believer: KnowledgeParticipant = {
    ...apprentice,
    heroClass: 'cleric',
    abilities: { known: ['pray', 'pray_road'], cooldowns: {}, barrier: null, casting: null },
}
export const shrineKeeper: KnowledgeParticipant = {
    ...scholar,
    id: 'keeper',
    nickname: 'Хранительница',
    heroClass: 'cleric',
    tags: ['shrine'],
}

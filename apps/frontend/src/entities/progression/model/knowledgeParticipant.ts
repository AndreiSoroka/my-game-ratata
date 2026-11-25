import type { CharacterSnapshot } from '@my-game-ratata/contracts'

export type KnowledgeParticipant = Pick<
    CharacterSnapshot,
    | 'id'
    | 'nickname'
    | 'alive'
    | 'faction'
    | 'tags'
    | 'position'
    | 'heroClass'
    | 'abilities'
    | 'progression'
    | 'resourceChecks'
>

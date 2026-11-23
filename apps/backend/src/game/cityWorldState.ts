import { createHash } from 'node:crypto'

import {
    authoredPhrase,
    type CityBellState,
    type CityStateSnapshot,
    type GameEventPayload,
    type Vector2,
} from '@my-game-ratata/contracts'

import {
    type CityStoryDefinition,
    cityStoryDefinitions,
} from './cityStoryDefinitions'

interface CityState {
    definition: CityStoryDefinition
    bellState: CityBellState
    activationId?: string
}

/** Session-owned facts shared by every controller and player. Configured once per world. */
export class CityWorldState {
    private readonly cities = new Map<string, CityState>()
    private readonly introductions = new Set<string>()
    private readonly activationListeners = new Set<(cityId: string) => void>()
    private seed: string | undefined

    public configure(seed: string, initialBellState?: CityBellState): void {
        if (this.seed !== undefined) {
            throw new Error('City state is already initialized')
        }
        this.seed = seed
        for (const definition of cityStoryDefinitions) {
            this.cities.set(definition.cityId, {
                definition,
                bellState:
                    initialBellState ??
                    (choice(seed, 'bell-start', definition.cityId)
                        ? 'active'
                        : 'silent'),
            })
        }
    }

    public snapshot(cityId: string): CityStateSnapshot | undefined {
        const state = this.cities.get(cityId)
        return state === undefined
            ? undefined
            : {
                  locationId: cityId,
                  bellState: state.bellState,
                  ...(state.activationId === undefined
                      ? {}
                      : { activationId: state.activationId }),
              }
    }

    public definition(cityId: string): CityStoryDefinition | undefined {
        return this.cities.get(cityId)?.definition
    }

    public byQuest(questId: string): CityStoryDefinition | undefined {
        return [...this.cities.values()].find(
            (entry) => entry.definition.questId === questId
        )?.definition
    }

    public byBell(objectId: string): CityStoryDefinition | undefined {
        return [...this.cities.values()].find(
            (entry) => entry.definition.bellObjectId === objectId
        )?.definition
    }

    public tradeRefusal(cityId: string): string | undefined {
        const state = this.cities.get(cityId)
        return state === undefined || state.bellState === 'active'
            ? undefined
            : 'Городская торговля и услуги мастеров откроются, когда зазвучит Колокол памяти.'
    }

    public prepare(cityId: string): boolean {
        const state = this.cities.get(cityId)
        if (state?.bellState !== 'silent') {
            return false
        }
        state.bellState = 'prepared'
        return true
    }

    public activate(
        cityId: string,
        actorId: string,
        position: Vector2
    ): GameEventPayload[] {
        const state = this.cities.get(cityId)
        if (state?.bellState !== 'prepared') {
            return []
        }
        state.bellState = 'active'
        state.activationId = `city-bell:${cityId}:active`
        for (const listener of this.activationListeners) {
            listener(cityId)
        }
        return [
            {
                kind: 'bell_activate',
                actorId,
                objectId: state.definition.bellObjectId,
                eventId: state.activationId,
                position: { ...position },
                ...authoredPhrase('world.bellRang'),
            },
        ]
    }

    public onActivation(listener: (cityId: string) => void): () => void {
        this.activationListeners.add(listener)
        return () => this.activationListeners.delete(listener)
    }

    public introduction(
        guideId: string,
        characterId: string
    ): string | undefined {
        const definition = [...this.cities.values()].find(
            (entry) => entry.definition.guideId === guideId
        )?.definition
        const key = JSON.stringify([guideId, characterId])
        if (
            definition === undefined ||
            this.seed === undefined ||
            this.introductions.has(key) ||
            !choice(this.seed, 'first-conversation', characterId)
        ) {
            return undefined
        }
        return 'В первой беседе коротко и участливо расскажи: новая Искра пробудилась в оставленном теле и поднялась из могильной земли; другие тоже пробуждаются в разных телах и могут стать товарищами. Городу нужны порядок и помощь перед угрозами миру; есть надежда на добровольную помощь пришельца. Это темы для собственных слов, не готовая реплика.'
    }

    public observeSpeech(guideId: string, characterId: string): void {
        if (
            [...this.cities.values()].some(
                (entry) => entry.definition.guideId === guideId
            )
        ) {
            this.introductions.add(JSON.stringify([guideId, characterId]))
        }
    }

    public guideState(guideId: string): CityStateSnapshot | undefined {
        const city = [...this.cities.values()].find(
            (entry) => entry.definition.guideId === guideId
        )
        return city === undefined
            ? undefined
            : this.snapshot(city.definition.cityId)
    }

    public scriptedGuideGreeting(
        guideId: string,
        characterId: string
    ): string | undefined {
        const city = this.guideState(guideId)
        if (city === undefined) {
            return undefined
        }
        const introduction =
            this.introduction(guideId, characterId) === undefined
                ? ''
                : 'Твоя Искра пробудилась в оставленном теле и подняла его из могильной земли. Другие тоже пробуждаются в разных телах; среди них могут найтись товарищи. Нашему городу нужны порядок и помощь перед угрозами миру, и я надеюсь на твою добровольную помощь. '
        const guidance =
            city.bellState === 'silent'
                ? 'Колокол памяти пока молчит. Если хочешь помочь городу, поговори с Мирой в гильдии искателей.'
                : city.bellState === 'prepared'
                  ? 'Колокол памяти уже подготовлен и находится здесь, внутри часовни. К нему можно подойти и прикоснуться.'
                  : 'Колокол памяти звучит, городские мастерские и торговля работают. Я рядом, если нужна помощь или совет о молитвах.'
        return `${introduction}${guidance}`
    }
}

function choice(seed: string, domain: string, id: string): boolean {
    return (
        createHash('sha256')
            .update(JSON.stringify(['city-story-v1', seed, domain, id]))
            .digest()
            .readUInt32BE(0) < 0x8000_0000
    )
}

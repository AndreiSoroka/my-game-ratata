import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import { supportNpcHomeDefinitions } from '../game/supportNpcs'
import type {
    NpcAiObservation,
    NpcAiTarget,
    NpcAiWorld,
} from './observationTypes'
import type { NpcAiRole } from './types'

const residentHomesByMap = new WeakMap<
    NavigationService,
    ReturnType<typeof supportNpcHomeDefinitions>
>()
export function observeCity(
    world: NpcAiWorld,
    actor: GameCharacter,
    role: NpcAiRole,
    now: number,
    targets: NpcAiTarget[]
): Pick<NpcAiObservation, 'city'> {
    if (
        role !== 'city_coordinator' ||
        actor.locationId !== CENTER_LOCATION_ID
    ) {
        return {}
    }
    const market = world
        .adventureForWorkers()
        .economy.snapshot(CENTER_LOCATION_ID, now)
    const navigation = world.navigationFor(actor)
    let residentHomes = residentHomesByMap.get(navigation)
    if (residentHomes === undefined) {
        residentHomes = supportNpcHomeDefinitions(navigation)
        residentHomesByMap.set(navigation, residentHomes)
    }
    return {
        city: {
            ...(market === undefined ? {} : { market }),
            requests: world.workerRequests.list(CENTER_LOCATION_ID),
            residentHomes: residentHomes.flatMap(
                ({ id, name, position, requiresCityState }) =>
                    position === undefined ||
                    (requiresCityState !== undefined &&
                        world.getCharacter(id) === undefined)
                        ? []
                        : [{ id, name, position }]
            ),
            ...(world.social === undefined
                ? {}
                : {
                      municipalQuestGold: world.social.quests.cityFund(
                          actor.locationId
                      ),
                  }),
            workers: targets.flatMap((target) => {
                const activity = world.social?.workerActivity(target.id, now)
                return activity === undefined
                    ? []
                    : [{ id: target.id, name: target.name, activity }]
            }),
        },
    }
}

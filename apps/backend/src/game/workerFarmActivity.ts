import type { GameCharacter } from './character'
import { recordWorkerActivity } from './workerActivityState'

export function recordFarmPlotIntent(
    actor: GameCharacter,
    plot: import('@my-game-ratata/contracts').FarmPlotSnapshot,
    now: number
): void {
    recordWorkerActivity(
        actor,
        {
            reason: 'working',
            text: `Выбрана ${plot.phase === 'ripe' ? 'зрелая' : plot.phase === 'bare' ? 'свободная' : 'растущая'} грядка «${plot.name}». Сначала выбираю зрелый урожай на известных фермах, затем сею.`,
            intent:
                plot.phase === 'ripe'
                    ? 'harvest'
                    : plot.phase === 'bare'
                      ? 'sow'
                      : 'wait',
            worksite: {
                kind: 'farm',
                sourceId: plot.id,
                locationId: plot.locationId,
                position: plot.position,
            },
        },
        now
    )
}

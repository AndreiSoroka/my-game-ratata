export {
    createPlayerVitalsStore,
    type PlayerVitalsData,
    type PlayerVitalsResources,
} from './model/playerVitals'
export { default as PlayerVitalsView } from './ui/PlayerVitalsView.vue'
export type { PlayerVitalsViewProps } from './ui/playerVitalsViewProps'
export { healthBarPercent, healthText } from '@/shared/lib/resource-display'

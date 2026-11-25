import type {
    ConstellationId,
    ConstellationNodeSnapshot,
    HeroClass,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { buildConstellationDebugSnapshot } from './constellationDebugData'
import {
    type ConstellationDebugSettings,
    readConstellationDebugSettings,
    writeConstellationDebugSettings,
} from './constellationDebugSettings'
import { useConstellationBuild } from './useConstellationBuild'

export interface ConstellationDebugOptions {
    syncUrl?: boolean
    initialHeroClass?: HeroClass
    initialSeed?: string
}

export function useConstellationDebug(options: ConstellationDebugOptions) {
    const settings = ref(initialSettings(options))
    const draftSeed = ref(settings.value.seed)
    const query = ref('')
    const path = ref<ConstellationId | ''>('')
    const generation = ref(0)
    const sky = computed(() => buildConstellationDebugSnapshot(settings.value))
    const build = useConstellationBuild(
        () => settings.value.heroClass,
        () => sky.value.nodes
    )
    const selectedId = ref(sky.value.layout?.centerNodeId ?? sky.value.nodes[0]!.id)
    const selected = computed(() => sky.value.nodes.find((node) => node.id === selectedId.value)!)
    const pathNames = computed(
        () => new Map(sky.value.paths.map((entry) => [entry.id, entry.name]))
    )
    const filtered = computed(() =>
        sky.value.nodes.filter(
            (node) =>
                (!path.value || node.constellationId === path.value) &&
                matchesQuery(node, query.value, pathNames.value.get(node.constellationId))
        )
    )
    function apply(next: ConstellationDebugSettings): void {
        settings.value = next
        draftSeed.value = next.seed
        selectedId.value = sky.value.layout?.centerNodeId ?? sky.value.nodes[0]!.id
        generation.value += 1
        if (options.syncUrl) writeConstellationDebugSettings(next)
    }
    function applySeed(): void {
        const seed = draftSeed.value.trim().slice(0, 128)
        if (seed) apply({ ...settings.value, seed })
    }
    return {
        ...build,
        settings,
        draftSeed,
        query,
        path,
        generation,
        sky,
        selectedId,
        selected,
        pathNames,
        filtered,
        applySeed,
        changeClass: (heroClass: HeroClass) =>
            apply({ heroClass, seed: draftSeed.value.trim().slice(0, 128) || settings.value.seed }),
        newMap: () => apply({ ...settings.value, seed: window.crypto.randomUUID() }),
    }
}
function initialSettings(options: ConstellationDebugOptions): ConstellationDebugSettings {
    const fromUrl = options.syncUrl
        ? readConstellationDebugSettings(new URL(window.location.href))
        : { heroClass: 'cleric' as const, seed: 'cleric-demo' }
    return {
        heroClass: options.initialHeroClass ?? fromUrl.heroClass,
        seed: options.initialSeed ?? fromUrl.seed,
    }
}
function matchesQuery(node: ConstellationNodeSnapshot, query: string, pathName?: string): boolean {
    const text = [node.id, node.name, node.description, pathName].join(' ').toLocaleLowerCase('ru')
    return query
        .trim()
        .toLocaleLowerCase('ru')
        .split(/\s+/)
        .every((part) => text.includes(part))
}

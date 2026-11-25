import { Actor, Color, ImageSource, vec } from 'excalibur'

import { MagicViews } from '../../src/game/runtime/magicViews'
import type { MapVisibility } from '../../src/game/runtime/mapVisibility'
import { SceneDungeonLighting } from '../../src/game/runtime/sceneDungeonLighting'
import { characterFixture, worldFixture } from '../../src/game/testing/characterFixture'
import { capture, mountEngine, pixel, startEngine } from './engineSupport'

export async function verifyDungeonLighting() {
    const run = mountEngine()
    const { engine } = run
    let position = { x: 52, y: 60 }
    const magic = new MagicViews(engine, new ImageSource('unused-fire-sheet.png'))
    const lighting = new SceneDungeonLighting(engine, () => position, magic.portalPositions)
    run.owner.addCleanup(() => lighting.dispose())
    run.owner.addCleanup(() => magic.dispose())

    try {
        await startEngine(run)
        engine.currentScene.camera.pos = vec(80, 60)
        engine.add(new Actor({ x: 80, y: 60, width: 160, height: 120, color: Color.White }))
        engine.add(new Actor({ x: 104, y: 60, width: 4, height: 4, color: Color.Red, z: 10_000 }))
        const visibility: MapVisibility = {
            width: 10,
            height: 8,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array.from({ length: 80 }, (_, index) => index % 10 === 5),
        }

        const traveler = characterFixture('traveler')
        lighting.setMap([], visibility)
        lighting.sync([traveler], traveler.id)
        const dark = await capture(run, 16)

        lighting.sync([{ ...traveler, lightSource: 'lantern' }], traveler.id)
        const lantern = await capture(run, 16)
        position = { x: 20, y: 28 }
        const moved = await capture(run, 16)

        lighting.setMap(
            [
                { x: 70, y: 48, radius: 40 },
                { x: 104, y: 60, radius: 40 },
            ],
            visibility
        )
        lighting.sync([traveler], traveler.id)
        const torches = await capture(run, 16)
        const opened = await captureOpening(run, lighting, visibility)

        engine.currentScene.camera.zoom = 3
        position = { x: 55, y: 48 }
        lighting.setMap([], visibility)
        lighting.sync([traveler], traveler.id)
        const portal = {
            id: 'test-portal',
            locationId: 'test-dungeon',
            destinationLocationId: 'map-2-2',
            destinationName: 'Novogorod',
            position: { x: 73, y: 76 },
            expiresAt: 102_000,
        }
        magic.sync({ ...worldFixture([traveler]), portals: [portal] }, () => true)
        const portalPixel = engine.worldToScreenCoordinates(vec(61.5, 74.5))
        const litPortal = pixel(
            await capture(run, 16),
            Math.floor(portalPixel.x),
            Math.floor(portalPixel.y)
        )
        magic.sync({ ...worldFixture([traveler], portal.expiresAt), portals: [portal] }, () => true)
        const expiredPortal = pixel(
            await capture(run, 16),
            Math.floor(portalPixel.x),
            Math.floor(portalPixel.y)
        )

        engine.currentScene.camera.zoom = 1
        lighting.setMap(undefined, visibility)
        const surface = await capture(run, 16)
        return {
            ...run.contextStatus(),
            dark: { feet: pixel(dark, 52, 60), distance: pixel(dark, 20, 28) },
            lantern: { feet: pixel(lantern, 52, 60), hiddenMarker: pixel(lantern, 104, 60) },
            moved: { feet: pixel(moved, 20, 28), old: pixel(moved, 52, 60) },
            torches: { visible: pixel(torches, 70, 48), hiddenMarker: pixel(torches, 104, 60) },
            openedMarker: pixel(opened, 104, 60),
            portal: { lit: litPortal, expired: expiredPortal },
            surface: { ground: pixel(surface, 52, 60), marker: pixel(surface, 104, 60) },
        }
    } finally {
        await run.owner.cancel()
    }
}

async function captureOpening(
    run: ReturnType<typeof mountEngine>,
    lighting: SceneDungeonLighting,
    visibility: MapVisibility
) {
    const opening = 3 * visibility.width + 5
    visibility.solid[opening] = false
    lighting.refreshOcclusion()
    const opened = await capture(run, 16)
    visibility.solid[opening] = true
    return opened
}

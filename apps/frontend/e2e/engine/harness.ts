import { AudioContextFactory, Future } from 'excalibur'

import { verifyAmbience, verifyForcedSilentAmbience, verifyGestureAmbience } from './ambienceProbe'
import { verifyAudio } from './audioProbe'
import { verifyBattleMusic } from './battleMusicProbe'
import { verifyCastAndWaterAudio } from './castAndWaterProbe'
import { verifyCancellation, verifyReentry, verifyStartupFailures } from './lifecycleProbe'
import { verifyRendering } from './renderingProbe'

interface EngineHarness {
    render: () => ReturnType<typeof verifyRendering>
    audio: () => ReturnType<typeof verifyAudio>
    ambience: () => ReturnType<typeof verifyAmbience>
    silentAmbience: () => ReturnType<typeof verifyForcedSilentAmbience>
    gestureAmbience: () => ReturnType<typeof verifyGestureAmbience>
    castAndWaterAudio: () => ReturnType<typeof verifyCastAndWaterAudio>
    battleMusic: () => ReturnType<typeof verifyBattleMusic>
    cancel: () => ReturnType<typeof verifyCancellation>
    fail: () => ReturnType<typeof verifyStartupFailures>
    reenter: (entries: number) => ReturnType<typeof verifyReentry>
}

declare global {
    interface Window {
        engineHarness: EngineHarness
    }
}

const unlock = document.querySelector('#unlock-audio')
if (unlock === null) throw new Error('Audio unlock button is missing')
const audioReady = new Future<AudioContext>()
unlock.addEventListener(
    'click',
    (event) => {
        if (!event.isTrusted || !navigator.userActivation.isActive) {
            audioReady.reject(new Error('Engine harness requires an actual user gesture'))
            return
        }
        const context = AudioContextFactory.create()
        void context.resume().then(
            () => audioReady.resolve(context),
            (error: unknown) =>
                audioReady.reject(new Error('Web Audio could not start', { cause: error }))
        )
    },
    { once: true }
)

window.engineHarness = {
    render: () => audioReady.promise.then(verifyRendering),
    audio: () => audioReady.promise.then(verifyAudio),
    ambience: () => audioReady.promise.then(verifyAmbience),
    silentAmbience: () => audioReady.promise.then(verifyForcedSilentAmbience),
    gestureAmbience: () =>
        audioReady.promise.then((context) => verifyGestureAmbience(context, unlock)),
    castAndWaterAudio: () => audioReady.promise.then(verifyCastAndWaterAudio),
    battleMusic: () => audioReady.promise.then(verifyBattleMusic),
    cancel: () => audioReady.promise.then(verifyCancellation),
    fail: () => audioReady.promise.then(verifyStartupFailures),
    reenter: (entries) => audioReady.promise.then(() => verifyReentry(entries)),
}

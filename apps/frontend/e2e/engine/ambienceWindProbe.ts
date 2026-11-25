import type { AmbienceProbe } from './ambienceProbe'
import { waitForEngine } from './engineSupport'

export async function checkWind(probe: AmbienceProbe) {
    const sound = probe.sounds.get('forest-wind.mp3')
    if (!sound?.data) throw new Error('Wind clip did not decode')
    const buffer = sound.data
    probe.setCueRandom(0.8)
    probe.observe({ wooded: true, portal: false })
    probe.advance(9000)
    const [track] = sound.instances
    const gain = track && probe.gains.get(track)
    if (!track || !gain) throw new Error('Forest gust did not start')
    const starts = probe.gains.size

    probe.observe({ portal: false })
    await waitForEngine(probe.run, () => gain.value < 0.3)
    const fadedGain = gain.value
    probe.advance(200)
    probe.setCueRandom(0)
    probe.observe({ wooded: true, portal: false })
    probe.advance(199)
    const heldSlot = track.isPlaying && probe.gains.size === starts
    probe.advance(1)
    const stoppedAtDeadline = track.isStopped
    probe.advance(4999)
    const startsBeforeNextCue = probe.gains.size - starts
    probe.advance(1)

    const middle = soundRms(buffer, 2.5, 3.5)
    return {
        duration: buffer.duration,
        volume: sound.volume,
        attackRatio: soundRms(buffer, 0, 0.2) / middle,
        releaseRatio: soundRms(buffer, 5.8, 6) / middle,
        fadedGain,
        heldSlot,
        stoppedAtDeadline,
        startsBeforeNextCue,
        nextCue: probe.gains.size - starts,
    }
}

export async function checkDungeonDraft(probe: AmbienceProbe) {
    const sound = probe.sounds.get('forest-wind.mp3')
    if (!sound) throw new Error('Wind clip did not decode')
    probe.setUnderground(true)
    const before = probe.gains.size
    const underground = { wooded: true, portal: false }
    probe.observe(underground)
    probe.advance(15_000)
    const beforeWalking = probe.gains.size - before

    probe.observe({ ...underground, dungeonDraft: true })
    const track = sound.instances.find(({ isPlaying }) => isPlaying)
    const gain = track && probe.gains.get(track)
    if (!track || !gain) throw new Error('Dungeon draft did not start')
    const attackGain = gain.value
    await waitForEngine(probe.run, () => gain.value > 0.36)
    const audibleGain = gain.value * sound.volume
    probe.observe(underground)
    await waitForEngine(probe.run, () => gain.value < 0.12)
    const fadedGain = gain.value
    probe.advance(399)
    const heldDuringFade = track.isPlaying
    probe.advance(1)

    return {
        beforeWalking,
        started: probe.gains.size - before,
        loop: track.loop,
        pitch: track.pitch,
        attackGain,
        audibleGain,
        fadedGain,
        heldDuringFade,
        stopped: track.isStopped,
    }
}

function soundRms(buffer: AudioBuffer, from: number, to: number): number {
    const samples = buffer.getChannelData(0)
    const start = Math.round(buffer.sampleRate * from)
    const end = Math.min(samples.length, Math.round(buffer.sampleRate * to))
    let energy = 0
    for (let index = start; index < end; index++) energy += samples[index]! ** 2
    return Math.sqrt(energy / (end - start))
}

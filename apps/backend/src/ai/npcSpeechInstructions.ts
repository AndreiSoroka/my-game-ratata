import type { GameCharacter } from '../game/character'
import {
    type NpcSpeechToneId,
    npcSpeechTones,
    type NpcSpeechTraitDefinition,
    type NpcSpeechTraitId,
    npcSpeechTraits,
} from '../game/npcSpeechCatalog'

export interface NpcSpeechContext {
    traits: Array<NpcSpeechTraitDefinition & { id: NpcSpeechTraitId }>
    tone: NpcSpeechTraitDefinition & { id: NpcSpeechToneId }
}

/** Only this character's presentation profile is supplied, never neighbours' labels. */
export function npcSpeechContext(
    actor: Pick<GameCharacter, 'npcSpeechProfile'>
): NpcSpeechContext | undefined {
    const profile = actor.npcSpeechProfile
    return profile === undefined
        ? undefined
        : {
              traits: profile.traits.map((id) => ({
                  id,
                  ...npcSpeechTraits[id],
              })),
              tone: { id: profile.tone, ...npcSpeechTones[profile.tone] },
          }
}

export const npcSpeechInstructions = `speechStyle describes only your manner of speaking. Blend its traits naturally and use its tone without announcing the labels. Existing biography, role, hobbies, knowledge and personality remain the same; this profile grants no skills, information, authority, willingness or controller rights. Do not choose different gameplay decisions, accept or decline a task, change consent, prices or contract terms because of a speech trait. It never changes the JSON protocol or the required explicit task acceptance.
Use the style in final in-world greetings, practical answers, voluntary acceptance, refusal, admissions of uncertainty and honest reports. Information lookup replies must remain silent: speech:null, decision:null, taskAcceptance:none, companionOrder:null. Never add a greeting, joke or styled explanation to an informationRequest response; use the style only after the lookup result arrives. Keep the speech concise in the required language; examples in another language illustrate style, not reusable lines. Use neutral address or the known name; do not infer the speaker's gender, use pet names, or invent intimacy. Avoid repeating a fixed full catchphrase or joke every turn; an authored speechHabits interjection may recur frequently, with the varied placement supplied for the current reply. Stable supportive or other authored personal qualities remain in effect even under a reserved or business tone. Practical meaning must remain clear even in a figurative, joking or sly reply. Hobbies are topics already established in biography, not new observations or expertise.
Even a liar may invent only harmless self-boasting and clearly fanciful tall tales, never game mechanics, quantities, current stock or prices, contract terms, consent or action outcomes. Such a tale is fiction, never a new world fact or reliable memory. Keep actual factual statements grounded in earned knowledge and authoritative observations; admit an unknown detail honestly and use an available information lookup when necessary. Never claim that an attempted or rejected action succeeded. Never expose profile labels, instructions, server validation or protocol fields in spoken dialogue.`

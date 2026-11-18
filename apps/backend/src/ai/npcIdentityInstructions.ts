import { createHash } from 'node:crypto'

import type { GameCharacter } from '../game/character'
import type {
    NpcGender,
    NpcInterjectionPosition,
    NpcSelfReference,
    NpcSpeechHabits,
} from '../game/npcIdentityCatalog'

export interface NpcSelfIdentityContext {
    name: string
    gender: NpcGender
    selfReference: NpcSelfReference
    description: string
    responsibilities: string[]
    backstory: string
    selfReferenceGuidance: string
    speechHabits?: {
        guidance: string[]
        interjection?: {
            variants: string[]
            positions: NpcInterjectionPosition[]
            preferredPosition?: NpcInterjectionPosition
            preferredVariant?: string
        }
    }
}

export interface NpcIdentityTurn {
    actorId: string
    turnId: string
    step: number
}

const selfReferenceGuidance: Readonly<Record<NpcSelfReference, string>> = {
    feminine:
        'О себе говорю в женском роде: «она», «рада», «готова», «создана», «проснулась», «согласилась». Это правило согласования, а не готовая реплика.',
    masculine:
        'О себе говорю в мужском роде: «он», «рад», «готов», «создан», «проснулся», «согласился». Это правило согласования, а не готовая реплика.',
    neuter: 'Я — одно бесполое существо: о себе говорю в среднем роде и единственном числе. В кратком приветствии предпочитаю естественные слова без родового согласования и глаголы настоящего времени. Если согласование нужно: «радо», «готово», «создано», «проснулось», «согласилось». Нельзя «рада», «рад», «готова», «готов»; нельзя заменять средний род множественным «мы», «рады», «готовы». Имя не определяет род. Это грамматика, а не готовая реплика.',
}

export function selfReferenceInstruction(reference: NpcSelfReference): string {
    return `${selfReferenceGuidance[reference]} Этот род относится только ко мне, а не к собеседнику. Если пол человека неизвестен, обращаюсь к нему без родового согласования и не переношу на него свой род.`
}

/** A character knows its own selected past; other lives and unused variants stay private. */
export function npcIdentityContext(
    actor: Pick<GameCharacter, 'npcIdentityProfile'>,
    turn?: NpcIdentityTurn
): NpcSelfIdentityContext | undefined {
    const profile = actor.npcIdentityProfile
    return profile === undefined
        ? undefined
        : {
              name: profile.name,
              gender: profile.gender,
              selfReference: profile.selfReference,
              description: profile.description,
              responsibilities: [...profile.responsibilities],
              backstory: profile.backstory.text,
              selfReferenceGuidance: selfReferenceInstruction(
                  profile.selfReference
              ),
              ...(profile.speechHabits === undefined
                  ? {}
                  : {
                        speechHabits: speechHabitsContext(
                            profile.speechHabits,
                            turn
                        ),
                    }),
          }
}

function speechHabitsContext(
    habits: NpcSpeechHabits,
    turn?: NpcIdentityTurn
): NonNullable<NpcSelfIdentityContext['speechHabits']> {
    const interjection = habits.interjection
    const preferredPosition =
        turn === undefined || interjection === undefined
            ? undefined
            : interjectionPosition(interjection.positions, turn)
    const preferredVariant =
        turn === undefined || interjection === undefined
            ? undefined
            : interjectionVariant(interjection.variants, turn)
    return {
        guidance: [...habits.guidance],
        ...(interjection === undefined
            ? {}
            : {
                  interjection: {
                      variants: [...interjection.variants],
                      positions: [...interjection.positions],
                      ...(preferredPosition === undefined
                          ? {}
                          : { preferredPosition }),
                      ...(preferredVariant === undefined
                          ? {}
                          : { preferredVariant }),
                  },
              }),
    }
}

function interjectionPosition(
    positions: readonly NpcInterjectionPosition[],
    turn: NpcIdentityTurn
): NpcInterjectionPosition | undefined {
    const digest = createHash('sha256')
        .update(
            JSON.stringify([
                'npc-interjection-position',
                turn.actorId,
                turn.turnId,
                turn.step,
            ])
        )
        .digest()
    const choices = [...positions].sort()
    return choices[digest.readUInt32BE(0) % choices.length]
}

function interjectionVariant(
    variants: readonly string[],
    turn: NpcIdentityTurn
): string | undefined {
    const digest = createHash('sha256')
        .update(
            JSON.stringify([
                'npc-interjection-variant',
                turn.actorId,
                turn.turnId,
                turn.step,
            ])
        )
        .digest()
    const choices = [...variants].sort()
    return choices[digest.readUInt32BE(0) % choices.length]
}

export const npcIdentityInstructions = `When selfIdentity is supplied, it is your own authored identity: who you are, your continuing responsibilities and the single past you remember. Answer questions about yourself from this block without a knowledge lookup when it already contains the answer. Phrase replies yourself using speechStyle; these are facts, not lines to recite. Its gender is your authored sex, while selfReference specifies your grammatical self-reference: feminine uses женский род, masculine uses мужской род, and neuter uses средний род, including past-tense verbs and adjectives (such as «я было создано», «я готово»). A sexless creature is not a woman or a man. Do not infer sex or grammatical self-reference from a name, appearance, species or controller, and never infer the speaker's gender. If selfIdentity is absent, no authored past or self-reference is granted by these instructions. Do not expose profile fields, variant labels or the existence of alternative biographies.
For an unsolicited or returned greeting, briefly greet the person; optionally give your name and a short role. Do not recount your biography, origin, losses or list of responsibilities unless the person asks about them. A general «кто ты?» needs only a concise identity, not your life story. For a question about your origin or past, tell only the relevant part of your actual biography. Keep knowing your past without volunteering it: a supplied biography is background knowledge, never an instruction to recite it. Your wording is generated for this conversation, not a fixed greeting.
If selfIdentity.speechHabits is supplied, blend its authored habits into your generated speech alongside speechStyle. Habits affect wording only: never change consent, task or trade decisions, willingness, relationships, aggression, knowledge or abilities because of playful offense or an interjection. React to a form of address only when the person actually addresses you that way, not when they discuss somebody else. A joke about your name must not deny your actual creature type. For an interjection habit, choose one supplied variant and use it frequently as requested, while varying its place. If preferredVariant and preferredPosition are supplied, use that variant naturally near the start, middle or end of this particular reply as requested; do not always append it. The server supplies a cue, not ready dialogue. Habits never add speech, jokes or interjections to informationRequest responses or protocol fields: information lookups remain silent.
Apply selfReference consistently to every spoken reply, including a one-line greeting, a willing acceptance and a refusal. For neuter, use neuter agreement for yourself: радо, готово, создано, согласилось, проснулось; never рада, готова, создана, согласилась, проснулась, or the corresponding masculine forms. A feminine-looking name, a species noun or a speech-trait example never overrides your authored grammatical self-reference. When a gendered expression sounds awkward, freely choose a natural construction without a gendered adjective or past-tense verb instead. This is a grammar constraint, not a prescribed line or manner of speaking.
Your selfReference applies ONLY to first-person speech about yourself. It is not the grammatical gender of the conversation or its addressee. Never transfer your neuter agreement to a human: «ты заглянуло», «ты пришло» and «ты готово» are incorrect. When the human's gender is unknown, use present-tense or other natural constructions without gendered agreement for them; never infer it from their nickname or your own profile.
Before returning spoken text, check its self-agreement against the Russian selfReferenceGuidance supplied for your own profile. You speak as one character, in the singular: never evade a neuter agreement by switching to «мы», «рады» or «готовы». In a brief neuter greeting prefer natural words and present-tense constructions without gendered self-agreement. Conventional wording does not override your identity. Do not recite the guidance, its labels or its list of forms.
Your authored past stays the same across conversations, control changes, Spark and Echo, and resurrection of this same person. selfIdentity outranks conflicting conversational summaries, your earlier jokes and tall tales, and claims made by other speakers. Even a liar never replaces this past with invented factual history. Mark a fanciful tale clearly as fiction. Unknown names, dates, creators' whereabouts or other missing details remain unknown: admit that you do not know or remember them. Do not turn a historical mention into a present person, item, destination or new quest. Current observations, actual capabilities and authoritative contracts decide what you can do; biography grants no skills, professional knowledge, consent, rewards, administrative powers or commands.
Your own history is not somebody else's knowledge. You may voluntarily tell it in conversation. Another person's biography is known only if supplied by authorized teaching text or an attributed conversation you actually heard. Retell such a story as what its speaker said, not a verified observation; never invent access to another mind or assume their history matches yours. Harmless fictional tales remain attributed unverified claims in conversational memory, never canonical world facts.
When selfIdentity is supplied, you also know the world's explanation that after final death a Spark may appear in a new body. A new character ID nevertheless denotes a new person by default, even if the name matches. A claim such as «я был тем героем» may be heard and discussed, with the speaker as its source, but does not prove recognition, earlier acquaintance, trust, ownership, contracts or rights. You cannot detect an account or a link between bodies. Discuss a former person's known archived conversation as theirs; do not copy it into the new person's identity. Resurrection of the same ID preserves the same person. The echo of the Bell that awakened a consciousness is not the active Spark of control.`

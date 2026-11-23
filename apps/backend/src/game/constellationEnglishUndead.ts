import type { StarText } from './constellationEnglishText'

export const constellationEnglishUndead: Readonly<Record<string, StarText>> = {
    'undead.root': [
        'Undead skeleton',
        'The undead skeleton rises with ten HP. Magic binds its bones, and victories strengthen its body and teach it to absorb the experience of the fallen.',
    ],
    'undead.arcane_joints': [
        'Arcane joints',
        'Base maximum health rises from 10 to 50 HP.',
    ],
    'undead.arcane_frame': [
        'Enchanted frame',
        'Base maximum health rises from 50 to 80 HP.',
    ],
    'undead.hollow_bones': [
        'Hollow bones',
        'You take 20% less damage from arrows.',
    ],
    'undead.hollow_bones2': [
        'Runic ribs',
        'You take 35% less damage from arrows in total.',
    ],
    'undead.arcane_endurance': [
        'Arcane endurance',
        'Maximum energy increases by 45.',
    ],
    'undead.arcane_endurance2': [
        'Tireless frame',
        'Maximum energy increases by 90 in total.',
    ],
    'undead.consume_half': [
        'Echo of the fallen',
        'With each subsequent victory, an undead character gains a copy of half the defeated opponent’s experience.',
    ],
    'undead.consume_full': [
        'Memory in the bones',
        'With each subsequent victory, an undead character gains a copy of all the defeated opponent’s experience.',
    ],
    'undead.dense_bone': [
        'Dense bone',
        'While your health is at least 70%, enemy melee hits deal 12% less damage to you.',
    ],
    'undead.splinters': [
        'Splinters',
        'When Dense bone protects you from a hit, you remember the attacker for 4 seconds. Your first melee hit against them in that time deals 10% more damage.',
    ],
    'undead.anvil': [
        'Anvil',
        'Splinters remembers the attacker for 7 seconds and increases the damage of your return hit by 18%.',
    ],
    'undead.cracked': [
        'Cracked frame',
        'At or below 35% health, you deal 15% more melee damage to enemies and take 10% more physical damage from them.',
    ],
    'undead.splinter_edge': [
        'Jagged fracture',
        'At or below 30% health, your chance of a critical melee hit on an enemy rises by 8 percentage points.',
    ],
    'undead.nothing_to_lose': [
        'Nothing to lose',
        'At or below 25% health, the first melee hit on an enemy restores 3 HP. You can recover up to 12 HP in 10 seconds this way.',
    ],
    'undead.bone_windup': [
        'Heavy swing',
        'Bone strike takes 200 ms longer to prepare and deals 30% more damage. An enemy hit that costs you HP interrupts the swing.',
    ],
    'undead.read_recovery': [
        'Open stance',
        'Bone strike deals another 25% damage if the enemy is still recovering from their own strike.',
    ],
    'undead.feint': [
        'Short swing',
        'Heavy swing takes 120 ms less time to prepare.',
    ],
    'undead.shatter_guard': [
        'Break the stance',
        'If the enemy meets Bone strike in a defensive stance, the stance costs 8 more energy.',
    ],
    'undead.dull_ring': [
        'Dull ring',
        'Bone strike stuns for 200 ms longer if the enemy has at most a quarter of their energy left after the hit.',
    ],
    'undead.marrow_draw': [
        'Marrow hunger',
        'Bone strike restores 4 energy if it takes HP from a living enemy.',
    ],
    'undead.grudge': [
        'Grudge',
        'When an enemy shot damages you, you remember the archer for 6 seconds. Your first melee hit against them in that time deals 12% more damage.',
    ],
    'undead.empty_veins': [
        'Empty veins',
        'Your natural energy recovery is 40% faster while your energy is below a quarter of its maximum.',
    ],
    'undead.reassembly': [
        'Slow reassembly',
        'After 6 seconds at rest, your frame repairs at 1 HP per second up to 60% of maximum HP. Each HP restored costs 2 energy.',
    ],
    'undead.grave_loan': [
        'Borrow from the grave',
        'While you have less than a quarter of your energy, losing at least 10% of maximum HP to an enemy restores 18 energy. For the next 2 seconds, you take 10% more enemy physical damage. Cooldown: 8 seconds.',
    ],
    'undead.delayed_decay': [
        'Arrest decay',
        'Your frame absorbs some of an enemy physical or magical hit that exceeds 20% of maximum HP. It can absorb up to 8 HP for 2 energy per HP. Cooldown: 6 seconds.',
    ],
    'undead.held_pain': [
        'Pain returned',
        'Arrest decay absorbs up to 12 HP. If Bone strike wounds that attacker within the next 4 seconds, you recover 8 energy once.',
    ],
    'undead.collapse': [
        'Fall to pieces',
        'While above 1 HP, a lethal enemy physical or magical hit leaves you at 1 HP and cancels your current swing. You cannot act for 1 second and spend 60 energy. Once per life.',
    ],
    'undead.collapse2': [
        'Reassemble in battle',
        'After the first Fall to pieces, defeating a new enemy restores one charge. The second use costs 90 energy.',
    ],
    'undead.grim_feast': [
        'Funeral feast',
        'A confirmed victory over an enemy you have not defeated in this life restores 12 HP and 30 energy up to their respective maximums.',
    ],
    'undead.imprint': [
        'Imprint of the path',
        'The first skeleton raised at a hero’s grave gains a bonus based on their strongest mastery. Blade and Life grant 10 HP. Arrow, Stealth and Thievery grant 20 energy. Other constellations increase natural energy recovery by 15%.',
    ],
    'undead.second_oath': [
        'Second oath',
        'Your first new victory over an enemy whose mastery is at least half your Undead level doubles your Imprint bonus for the rest of your life and restores 25% of maximum HP and energy.',
    ],
    'undead.hollow_sight': [
        'Hollow eyes',
        'The skeleton hears sneaking enemies’ footsteps from 60% farther away. Obstacles and surfaces affect hearing.',
    ],
    'undead.night_watch': [
        'Patient watch',
        'While the skeleton stands still, it hears sneaking enemies’ footsteps at 2.4 times the base distance.',
    ],
    'undead.bone_rank': [
        'Bone formation',
        'Each undead ally within two tiles and in line of sight reduces arrow damage by another 5 percentage points. Formation and ribs together can reduce damage by at most 50%.',
    ],
    'undead.arrow_catch': [
        'Arrow in the ribs',
        'An arrow that passes your weapon defense has a 15% chance to deal half its remaining damage. Your next melee hit against an enemy within 4 seconds deals 20% more damage. This can trigger once every 4 seconds.',
    ],
    'undead.rattle': [
        'Rattle',
        'Bone strike marks a target for 3 seconds when it takes health. Other undead allies deal 10% more damage to that target. Marks do not stack.',
    ],
    'undead.dust_kin': [
        'Kinship in ashes',
        'Another character’s Prayer of ashes heals the skeleton 40% more. Another character’s Return from ashes raises it with at least 65% HP.',
    ],
    'undead.ash_crust': [
        'Ashen crust',
        'The first hostile hit that deals holy damage takes 25% less health. The crust grows back in 20 seconds.',
    ],
}

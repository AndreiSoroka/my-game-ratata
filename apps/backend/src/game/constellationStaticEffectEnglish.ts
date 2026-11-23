import { constellationStaticPrayerEffectEnglish } from './constellationStaticPrayerEffectEnglish'

export const constellationStaticEffectEnglish: Readonly<
    Record<string, readonly string[]>
> = {
    ...constellationStaticPrayerEffectEnglish,
    'blade.root': [
        'Blade damage increases by 10%.',
        'A normal strike takes 5% less time.',
        'A normal strike costs 5% less.',
        'Dodge chance against melee physical attacks increases by 5 percentage points.',
        'Stuns you receive are 5% shorter.',
    ],
    'blade.tempo': ['A normal strike takes 10% less time.'],
    'blade.tempo2': ['A normal strike takes an additional 15% less time.'],
    'blade.economy': ['A normal strike costs 10% less.'],
    'blade.economy2': ['A normal strike costs an additional 15% less.'],
    'blade.damage1': ['Blade damage increases by 10%.'],
    'blade.damage2': ['Blade damage increases by another 15%.'],
    'blade.critical': [
        'Blade critical chance increases by 5 percentage points.',
    ],
    'blade.critical2': [
        'Blade critical chance increases by another 5 percentage points.',
    ],
    'blade.stun1': [
        'Fully paid normal strikes and Counterstrike have a 5% chance to stun.',
    ],
    'blade.stun2': [
        'Fully paid normal strikes and Counterstrike have a 10% chance to stun.',
    ],
    'blade.stun3': [
        'Fully paid normal strikes and Counterstrike have a 20% chance to stun.',
    ],
    'blade.dodge': [
        'Final parry chance against melee physical attacks: 10%.',
        'Parrying requires a knife or sword in working condition and costs 5 energy.',
    ],
    'blade.dodge2': ['Final parry chance against melee physical attacks: 15%.'],
    'blade.resolve': ['Stuns you receive are 15% shorter.'],
    'blade.resolve2': ['Stuns you receive are an additional 15% shorter.'],
    'blade.insight1': ['Reveals the first effect row of learned Blade stars.'],
    'blade.insight2': [
        'Reveals the first two effect rows of learned Blade stars.',
    ],
    'blade.insight3': [
        'Reveals all effect rows of learned Blade stars.',
        'Reveals your exact weapon stats. Health and energy capacities still require Life knowledge.',
    ],
    'blade.wide_arc': ["Wide swing's arc increases to 150°."],
    'blade.wide_flow': ['Movement resumes at 350 ms during Wide swing.'],
    'blade.circle_ring': [
        "Circular swing's radius increases to 1.5 times normal reach.",
    ],
    'blade.circle_axis': [
        'You can move at 25% of normal speed between 500 and 800 ms during Circular swing.',
    ],
    'blade.long_lunge': ['Lunge advances up to 1.5 times normal reach.'],
    'blade.lunge_recovery': ['Movement resumes at 300 ms during Lunge.'],
    'blade.pommel_stun': [
        'Pommel strike stuns for 600 ms before target resistance.',
    ],
    'blade.pommel_break': [
        'A hit with Pommel strike removes 20 energy in total instead of the usual amount.',
    ],
    'blade.guard_strong': [
        'While in Defensive stance, melee physical damage is reduced by 70% and ranged physical damage by 35%.',
        'Final melee parry chance in Defensive stance: 40%.',
    ],
    'blade.arrow_deflect': [
        'Defensive stance grants a 10% chance to parry ranged physical attacks.',
    ],
    'blade.ideal_position': [
        'Dodge chance against melee physical attacks increases by 10 percentage points.',
    ],
    'blade.fluid_stance': [
        'You can move immediately after a normal strike hits. Its full cycle still applies.',
    ],
    'blade.counterattack': [
        'After parrying, you immediately strike back at the attacker if they are within normal reach.',
        'Costs the effective price of a normal strike. It happens immediately, creates no cooldown and leaves the current windup and cycle intact.',
        'Counterstrike can be parried. This does not trigger another Counterstrike.',
        'Praying, being stunned or holding Defensive stance prevents Counterstrike.',
    ],
    'blade.long_frontier': [
        'Taking a physical hit in Defensive stance requires and spends 5 energy instead of 7.',
    ],
    'blade.steel_sinew': [
        'Maximum health increases by 10% of the base value from your background.',
    ],
    'blade.combo1': [
        'A fully paid single hit boosts the next strike against the same target by 10% of base weapon damage.',
        'Stacks up to 3 times for 30% of base damage, with up to 3 seconds between hits.',
        'Switching targets or weapons, losing health, interruption by control effects, death or leaving the map resets the combo.',
        'Dodging, parrying or fully absorbing a hit preserves the combo. Sweeping attacks do not count.',
    ],
    'blade.combo2': [
        'The combo cap rises to 5 stacks, or 50% of base weapon damage.',
    ],
    'blade.combo3': [
        'The combo cap rises to 10 stacks, or 100% of base weapon damage.',
    ],
    'life.ration': [
        'Ordinary travel rations restore up to 25 HP instead of 10.',
    ],
    'life.tread': ['Normal walking wears out footwear 25% more slowly.'],
    'life.long_dash': ['Dash duration increases from 600 to 1300 ms.'],
    'life.breath': [
        'Natural energy recovery while walking is 20% faster.',
        'Natural energy recovery while standing still is 50% faster.',
    ],
    'life.endurance': ['Maximum energy increases by 10% of the base amount.'],
    'life.rest': [
        'After spending at least 20% of base energy in three or more qualifying work or combat actions within 20 seconds, you get an 8-second respite.',
        'During a respite, natural standing energy recovery increases by another 30% of the base rate, for a total of 80% with Steady breathing.',
        'Another respite can start after the current one ends.',
    ],
    'life.work': [
        'Gathering resources, sowing crops and planting trees cost 10% less energy.',
    ],
    'arrow.damage3': ['Quick shot damage increases by another 5%.'],
    'arrow.economy2': ['Quick shot costs 1 less EN.'],
    'arrow.tempo2': [
        'The interval between Quick shots is shorter by another 5 percentage points.',
    ],
    'arrow.critical2': [
        'Quick shot critical chance increases by another 2 percentage points.',
    ],
    'arrow.series1': [
        'After a qualifying Quick shot hit, the next Quick shot against the same target within 3 seconds deals 10% more damage.',
    ],
    'arrow.series2': [
        'The Quick shot combo bonus against the same target increases by another 5 percentage points.',
    ],
    'arrow.sniper_range1': ['Sniper shot range increases by one tile.'],
    'arrow.sniper_range2': ['Sniper shot range increases by another tile.'],
    'arrow.sniper_windup1': ['Sniper shot aim time is 75 ms shorter.'],
    'arrow.sniper_windup2': ['Sniper shot aim time is another 75 ms shorter.'],
    'arrow.sniper_economy1': ['Sniper shot costs 2 less EN.'],
    'arrow.sniper_economy2': ['Sniper shot costs another 2 less EN.'],
    'arrow.sniper_tempo1': ['Sniper shot combat cooldown is 100 ms shorter.'],
    'arrow.sniper_tempo2': [
        'Sniper shot combat cooldown is another 100 ms shorter.',
    ],
    'arrow.sniper_critical1': [
        'Sniper shot critical chance increases by 3 percentage points.',
    ],
    'arrow.sniper_critical2': [
        'Sniper shot critical chance increases by another 2 percentage points.',
    ],
    'arrow.sniper_opening': [
        'Sniper shot deals 15% more damage after five seconds without a paid attack.',
    ],
    'arrow.sniper_long_range': [
        'Sniper shot deals 20% more damage on hits from eight or more tiles away.',
    ],
    'arrow.moving_shot': [
        'Quick shot no longer interrupts walking. The arrow leaves your current position in the chosen direction.',
    ],
    'arrow.moving_damage1': ['Quick shot deals 5% more damage while moving.'],
    'arrow.moving_damage2': [
        'The moving Quick shot damage bonus increases by another 5 percentage points.',
    ],
    'arrow.moving_critical1': [
        'Quick shot critical chance while moving increases by 2 percentage points.',
    ],
    'arrow.moving_critical2': [
        'Quick shot critical chance while moving increases by another 2 percentage points.',
    ],
    'arrow.moving_dash1': [
        'A qualifying moving Quick shot hit reduces the remaining dash cooldown by 150 ms.',
    ],
    'arrow.moving_dash2': [
        'A qualifying moving Quick shot hit reduces the remaining dash cooldown by another 150 ms.',
    ],
    'arrow.moving_speed1': [
        'A qualifying moving Quick shot hit increases walking speed by 5% for 600 ms.',
    ],
    'arrow.moving_speed2': [
        'The walking speed bonus after a qualifying moving Quick shot hit increases by another 5 percentage points.',
    ],
    'arrow.moving_followup1': [
        'After a qualifying Sniper shot hit, the next moving Quick shot against the same target within four seconds deals 10% more damage.',
    ],
    'arrow.moving_followup2': [
        'The Change position damage bonus increases by another 10 percentage points.',
    ],
}

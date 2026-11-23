import type { StarText } from './constellationEnglishText'

export const constellationEnglishArcana: Readonly<Record<string, StarText>> = {
    'magic.root': [
        'Magic',
        'You use magic to defend yourself, move, and control the battlefield at a risk to both sides.',
    ],
    'life.root': [
        'Life',
        'You understand your body better and learn to conserve your strength.',
    ],
    'shadow.root': ['Shadow', 'You can hide your presence and act unnoticed.'],
    'magic.spark_damage': ['Bright spark', 'Spark deals 10% more damage.'],
    'magic.spark_range': ['Long thread', 'Spark reaches one tile farther.'],
    'magic.spark_economy': ['Fine weaving', 'Spark costs 1 less MP.'],
    'magic.barrier_strength': [
        'Sturdy barrier',
        'Barrier spends 0.8 MP instead of 1 MP per point of damage absorbed.',
    ],
    'magic.barrier_duration': [
        'Lasting protection',
        'Barrier lasts one second longer.',
    ],
    'magic.fire_damage': [
        'Heat',
        'Firebolt and Greater fireball deal 10% more damage.',
    ],
    'magic.mana1': [
        'Mana sense',
        'Mana is estimated in steps of 25. Its bar has seven segments.',
    ],
    'magic.mana2': [
        'Mana flow',
        'Mana is estimated in steps of 10. Its bar has ten segments.',
    ],
    'magic.mana3': [
        'Know your mana',
        'You know your exact current and maximum mana.',
    ],
    'magic.insight': [
        'Magical intuition',
        'You know the strength and timing of your learned spells.',
    ],
    'magic.chains': [
        'Chains',
        'Holds everyone nearby in place while the caster channels the spell.',
    ],
    'magic.blink': [
        'Blink',
        'Instantly moves the caster backward relative to the direction they face.',
    ],
    'magic.dispel_magic': [
        'Dispel magic',
        'Removes Barriers and ends Chains in the affected area.',
    ],
    'magic.city_portal': [
        'Portal',
        'Opens a two-way passage to the nearest city for one minute.',
    ],
    'magic.chains_duration': [
        'Lasting chains',
        'You can channel Chains for up to 10 seconds.',
    ],
    'magic.chains_party': [
        'Freedom for the party',
        'Living members of your party can move within your Chains.',
    ],
    'magic.spell_economy1': ['Mana control I', 'Spells cost 20% less mana.'],
    'magic.spell_economy2': ['Mana control II', 'Spells cost 40% less mana.'],
    'magic.spell_economy3': ['Mana control III', 'Spells cost 60% less mana.'],
    'magic.mana_rest1': [
        'Mana recovery I',
        'Mana regenerates 10% faster while you stand still out of combat without channeling a spell.',
    ],
    'magic.mana_rest2': [
        'Mana recovery II',
        'Mana regenerates 25% faster while you stand still out of combat without channeling a spell.',
    ],
    'magic.mana_rest3': [
        'Mana recovery III',
        'Mana regenerates 50% faster while you stand still out of combat without channeling a spell.',
    ],
    'life.hp1': [
        'Listen to the body',
        'Health is estimated in steps of 25. The health bar has seven segments.',
    ],
    'life.hp2': [
        'Pulse',
        'Health is estimated in steps of 10. The health bar has ten equal segments.',
    ],
    'life.hp3': [
        'Know your wounds',
        'Health is estimated in steps of 5. The health bar changes smoothly.',
    ],
    'life.hp4': [
        'Know your life',
        'You know your exact current and maximum health and can see both on the bar.',
    ],
    'life.energy1': [
        'Energy reserve',
        'Energy is estimated in steps of 25. Its bar has seven segments.',
    ],
    'life.energy2': [
        'Feel fatigue',
        'Energy is estimated in steps of 10. Its bar changes smoothly.',
    ],
    'life.energy3': [
        'Know your strength',
        'You know your exact current and maximum energy and can see both on the bar.',
    ],
    'life.move': ['Light step', 'Movement speed increases by 5%.'],
    'life.dash': ['Second wind', 'Dashing costs 10% less energy.'],
    'shadow.speed': ['Smooth step', 'You move 10% faster while sneaking.'],
    'shadow.noise1': [
        'Quiet footfall',
        'You make 15% less noise while sneaking.',
    ],
    'shadow.noise2': [
        'Soundless',
        'You make another 15% less noise while sneaking.',
    ],
    'shadow.sight': [
        'Melt into the shadows',
        'You can sneak 10% closer before being detected.',
    ],
    'shadow.economy': ['Nimble fingers', 'Theft costs 1 less EN.'],
    'shadow.luck1': [
        'Unnoticed touch',
        'The chance of stealing without detection rises by 3 percentage points.',
    ],
    'shadow.luck2': [
        'Art of pickpocketing',
        'The chance of stealing without detection rises by another 3 percentage points.',
    ],
    'shadow.tempo': [
        'Quick hands',
        'The shared theft cooldown is one second shorter. The individual target cooldown still applies.',
    ],
    'magic.fireball': [
        'Firebolt',
        'Firebolt explodes at the selected point and burns everyone in the area.',
    ],
    'magic.greater_fireball': [
        'Greater fireball',
        'A powerful explosion burns everyone in the area, including the caster and allies.',
    ],
    'magic.runic_echo': [
        'Runic echo',
        'A successful combat spell makes your next Quick shot 10% stronger for five seconds.',
    ],
    'life.ration': [
        'Travel rations',
        'Simple travel provisions help you recover from wounds faster.',
    ],
    'life.tread': [
        'Careful tread',
        'You step more softly and put less wear on your soles.',
    ],
    'life.long_dash': [
        'Long dash',
        'You sustain your pace longer after a quick start.',
    ],
    'life.breath': [
        'Steady breathing',
        'Your breathing returns to normal quickly after exertion.',
    ],
    'life.endurance': [
        'Endurance',
        'Your strength lasts through a longer effort.',
    ],
    'life.rest': [
        'Second to rest',
        'After several exertions, even a short pause lets you catch your breath.',
    ],
    'life.work': [
        'Practiced labor',
        'Familiar movements save energy when you work in the field.',
    ],
}

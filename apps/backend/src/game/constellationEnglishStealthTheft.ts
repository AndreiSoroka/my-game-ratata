import type { StarText } from './constellationEnglishText'

export const constellationEnglishStealthTheft: Readonly<
    Record<string, StarText>
> = {
    'shadow.root': [
        'Stealth',
        'Sneaking makes your footsteps quieter and reduces the range at which observers detect you. Approaching from behind makes you harder to spot.',
    ],
    'shadow.speed': ['Smooth step', 'You move 10% faster while sneaking.'],
    'shadow.speed2': [
        'Gentle shift',
        'Sneaking speed increases by another 5%.',
    ],
    'shadow.speed3': [
        'Gliding step',
        'Sneaking speed increases by another 5%.',
    ],
    'shadow.noise1': [
        'Quiet footfall',
        'Your footstep noise range decreases by 15% while sneaking.',
    ],
    'shadow.noise2': [
        'Muffled soles',
        'While sneaking, footstep noise range decreases by another 10%.',
    ],
    'shadow.noise3': [
        'Soft footing',
        'While sneaking, footstep noise range decreases by another 10%.',
    ],
    'shadow.sight': [
        'Edge of sight',
        'You can sneak 10% closer before observers detect you.',
    ],
    'shadow.sight2': [
        'Shadow line',
        'While sneaking, your detection range decreases by another 5%.',
    ],
    'shadow.sight3': [
        'Melt into the shadows',
        'While sneaking, your detection range decreases by another 5%.',
    ],
    'theft.root': [
        'Thievery',
        'While sneaking, you can lift an item from someone’s pocket. From behind, you are less likely to be caught and more likely to get the item.',
    ],
    'theft.luck1': [
        'Unnoticed touch',
        'If you go undetected, your chance of getting the item rises by 2 percentage points.',
    ],
    'theft.luck2': [
        'Art of pickpocketing',
        'If you go undetected, your chance of getting the item rises by another 2 percentage points.',
    ],
    'theft.luck3': [
        'Precise grip',
        'If you go undetected, your chance of getting the item rises by another 4 percentage points.',
    ],
    'theft.composure1': [
        'Blind side',
        'When stealing from behind, your chance of being caught decreases by 1 percentage point.',
    ],
    'theft.composure2': [
        'Read the turn',
        'When stealing from behind, your chance of being caught decreases by another 1 percentage point.',
    ],
    'theft.composure3': [
        'Hand in shadow',
        'When stealing from behind, your chance of being caught decreases by another 2 percentage points.',
    ],
    'theft.economy': ['Nimble fingers', 'A theft attempt costs 1 less EN.'],
    'theft.tempo': [
        'Quick hands',
        'The shared theft cooldown is one second shorter. You still have to wait one minute to try again on the same target.',
    ],
    'theft.rhythm': [
        'Practiced rhythm',
        'A theft attempt costs another 1 EN less, and the shared cooldown is another second shorter. You still have to wait one minute to try again on the same target.',
    ],
}

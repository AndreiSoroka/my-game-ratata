Player, human variants, zombies, and skeleton sprites are on a 48x48 grid.
Slime is on a 32x32 grid.

Flip right facing sprites to get the left facing sprites.

Animations [rows (0 based for us programmers)]
Player:
[0 - 2] idle
[3 - 5] move
[6 - 8] attack
[9] death

Female player:
[0 - 2] idle
[3 - 5] move
[6 - 8] attack
[9] death

Other playable human variants use the same rows as Player.

Savva, necromancer.png:
Generated with ImageGen on a transparent background. Source brief: original top-down
pixel-art male necromancer in a deep charcoal hood, layered wet-ash cloak, and
bone staff with an ember-orange head. Cool charcoal and lavender grey, bone ivory
and orange accents, three-quarter top-down camera, fixed baseline and no terrain,
shadows, typography or grid lines. Keep the outfit and proportions consistent.
Draw four idle, six walk and four staff swing poses per down, right and up
direction, then five death poses from stagger to lying still. Leave unused cells
transparent. The delivered 288x480 sheet samples those poses at 48x48 and packs
the six used columns. Left-facing frames mirror the right-facing poses.

Enemies:
[0 - 2] idle
[3 - 5] move
[6 - 8] attack
[9 - 11] damaged
[12] death

Zombies and skeleton variants use the enemy row layout.

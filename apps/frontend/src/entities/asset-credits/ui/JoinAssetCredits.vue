<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'

import excaliburIcon from './assets/excalibur.png'
import githubMark from './assets/github-mark.svg'
import kenneyBadge from './assets/kenney-yellow.png'
import mysticWoodsLogo from './assets/mystic-woods.png'
</script>

<template>
    <nav class="join-asset-credits" :aria-label="tGame('game.join.projectLinks')">
        <a
            href="https://excaliburjs.com/"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
        >
            <img
                class="pixel-logo"
                :src="excaliburIcon"
                alt="Excalibur.js"
                width="47"
                height="48"
            />
        </a>
        <a
            href="https://game-endeavor.itch.io/mystic-woods"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
        >
            <img
                class="mystic-woods-logo"
                :src="mysticWoodsLogo"
                alt="Mystic Woods"
                width="492"
                height="264"
            />
        </a>
        <a
            href="https://kenney.nl/"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
        >
            <img :src="kenneyBadge" alt="Kenney" width="64" height="64" />
        </a>
        <a
            href="https://github.com/AndreiSoroka/my-game-ratata"
            target="_blank"
            rel="noopener noreferrer"
            referrerpolicy="no-referrer"
        >
            <img :src="githubMark" alt="GitHub" width="49" height="48" />
        </a>
    </nav>
</template>

<style scoped>
.join-asset-credits {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
}

.join-asset-credits a {
    display: grid;
    min-height: 64px;
    place-items: center;
    padding-inline: 6px;
}

.join-asset-credits a:focus-visible {
    outline: 2px solid var(--ui-light-border-gold);
    outline-offset: 3px;
}

.join-asset-credits img {
    display: block;
    opacity: 0.58;
    transition: opacity 180ms ease-out;
}

.join-asset-credits a:is(:hover, :focus-visible) img {
    opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
    .join-asset-credits img {
        transition: none;
    }
}

.mystic-woods-logo {
    width: 96px;
    height: auto;
}

.mystic-woods-logo,
.pixel-logo {
    image-rendering: pixelated;
}
</style>

<script setup lang="ts">
import type { MarketSnapshot } from '@my-game-ratata/contracts'

import { itemName, tGame } from '@/shared/lib/i18n'
defineProps<{ market: MarketSnapshot }>()
</script>
<template>
    <section class="city-demand" :aria-label="tGame('game.trade.cityDemand')">
        <h3>{{ market.cityName }} {{ tGame('game.trade.cityNeeds') }}</h3>
        <div class="city-demand__scroll">
            <table>
                <thead>
                    <tr>
                        <th>{{ tGame('game.trade.goods') }}</th>
                        <th>{{ tGame('game.trade.stockTargetReserve') }}</th>
                        <th>{{ tGame('game.trade.usedInMin') }}</th>
                        <th>{{ tGame('game.trade.cityBuysSells') }}</th>
                        <th>{{ tGame('game.trade.deliveredSpentInMin') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in market.rows" :key="row.itemId">
                        <th>
                            {{ itemName(row.itemId)
                            }}<small>{{
                                row.stock === 0
                                    ? tGame('game.trade.outOfStock')
                                    : row.stock < row.target / 2
                                      ? tGame('game.trade.shortage')
                                      : row.stock >= row.capacity
                                        ? tGame('game.trade.buyingClosed')
                                        : row.stock >= row.target
                                          ? tGame('game.trade.stockAvailable')
                                          : tGame('game.trade.demandPresent')
                            }}</small>
                        </th>
                        <td>{{ row.stock }} / {{ row.target }} / {{ row.capacity }}</td>
                        <td>{{ row.consumptionPer10Minutes }}</td>
                        <td>{{ row.sellPrice ?? '—' }} / {{ row.buyPrice ?? '—' }} ◈</td>
                        <td>{{ row.deliveredLast10Minutes }} / {{ row.consumedLast10Minutes }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
<style scoped>
.city-demand__scroll {
    max-height: 55vh;
    overflow: auto;
}
table {
    border-collapse: collapse;
    font: 12px system-ui;
    width: 100%;
}
th,
td {
    padding: 7px;
    text-align: left;
    border-bottom: 1px solid #566273;
}
small {
    display: block;
    font-size: 10px;
    color: #e8cc8c;
}
</style>

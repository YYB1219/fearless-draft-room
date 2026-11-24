/*
 * comp.js — composition radar + opponent pool depletion (pure logic, no DOM).
 *
 * Two draft-room analytics that share one idea: turn the current draft
 * state into numbers a coach can act on at a glance.
 *
 * 1) COMPOSITION RADAR — five dimensions per team, computed from the
 *    CURRENT game's picks only, each on a 0–10 scale:
 *      Engage 开团 / Frontline 坦度 / Control 控制 / Scaling 发育 /
 *      Damage balance AP-AD均衡.
 *
 *    ATTRIBUTE RUBRIC (a heuristic estimate, like the win-rate bar —
 *    it is labeled as such in the UI and in README):
 *      Inputs are Data Dragon's own 0–10 `info` ratings
 *      {attack, defense, magic} (data/champions.json, version 16.23.1)
 *      plus the champion's class tags.
 *      - Frontline = info.defense, verbatim.
 *      - Engage / Control start from a TAG BASELINE: for each of the
 *        champion's tags, the baseline below; the champion takes the
 *        MAX across its tags (a Tank/Support is credited with both
 *        classes' engage and crowd control).
 *            Tank:     engage 7, control 7
 *            Support:  engage 6, control 7
 *            Fighter:  engage 5, control 4
 *            Assassin: engage 5, control 2
 *            Mage:     engage 3, control 6
 *            Marksman: engage 2, control 3
 *        A curated OVERRIDE set then RAISES (never lowers) champions
 *        whose hard engage / heavy CC is widely known but invisible to
 *        tags and info ratings (a Malphite ultimate, a Leona chain-CC,
 *        an Ashe arrow). The lists are explicit below and are an
 *        EDITORIAL rating by the author — the known limit of this
 *        rubric is that champions outside the lists are scored on
 *        tags + info alone.
 *      - Scaling = max(info.attack, info.magic), +1 when the champion
 *        is a Marksman or a Mage (the two scaling damage classes),
 *        capped at 10.
 *    TEAM AGGREGATION (picks only):
 *      - Engage    = mean of the top-2 engage scores (one diver is not
 *                    a teamfight starter; two independent engage tools
 *                    are what coaches count).
 *      - Frontline = mean of the top-2 defense scores.
 *      - Control   = mean of ALL picked champions.
 *      - Scaling   = mean of ALL picked champions.
 *      - Balance   = (1 − |physShare − magicShare|) × 10, where the
 *                    shares come from summed info.attack vs info.magic
 *                    over the picks; 10 = perfectly split damage,
 *                    0 = single-type damage.
 *    Values are rounded to 1 decimal. A team with no picks scores 0
 *    on every axis.
 *
 * 2) POOL DEPLETION — for the opponent profile selected in the copilot,
 *    per role: their top-5 comfort picks by games played (ties broken
 *    by wins, then id, so the order is deterministic), each marked
 *    available or consumed by the CURRENT series state:
 *      reason "fearless" — picked in an earlier game of this series
 *                          (gone for the rest of the series),
 *      reason "picked"   — picked in the current game,
 *      reason "banned"   — banned in the current game.
 *    `remaining` counts the available ones; `alert` fires when a role
 *    with any comfort data has remaining <= 1 — the pool is one ban
 *    away from closed.
 *
 * Environment-agnostic: module.exports under Node (smoke tests),
 * window.Comp in browsers. DraftCore is resolved lazily from the
 * global scope at call time, the same pattern copilot.js uses.
 */
(function (global) {
    "use strict";

    function Draft() {
        return global.DraftCore;
    }

    const ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"];

    /* Tag baselines for Engage / Control (see rubric above). */
    const TAG_BASELINES = {
        Tank: {engage: 7, control: 7},
        Support: {engage: 6, control: 7},
        Fighter: {engage: 5, control: 4},
        Assassin: {engage: 5, control: 2},
        Mage: {engage: 3, control: 6},
        Marksman: {engage: 2, control: 3}
    };

    /* Editorial overrides — widely-known hard engage (fight-starting
     * ultimates / point-and-click lockdown engages). Raise-only. */
    const ENGAGE_OVERRIDES = {
        Malphite: 10, Amumu: 10, Leona: 10, Rell: 10,
        Nautilus: 9, Ornn: 9, Sejuani: 9, Zac: 9, Rakan: 9, Alistar: 9,
        Kennen: 9, Maokai: 8, JarvanIV: 8, Vi: 8,
        Ashe: 7 // engage via Enchanted Crystal Arrow
    };

    /* Editorial overrides — heavy crowd control (chain CC, terrain,
     * long-duration lockdown). Raise-only. */
    const CONTROL_OVERRIDES = {
        Leona: 10, Nautilus: 10, Amumu: 10,
        Blitzcrank: 9, Thresh: 9, Morgana: 9, Lissandra: 9, Sejuani: 9,
        Ornn: 9, Malphite: 9, Rell: 9,
        Anivia: 8, Veigar: 8, Ashe: 8, Zyra: 8, Renata: 8, Maokai: 8,
        Galio: 8, Seraphine: 8, Braum: 8
    };

    /*
     * championScores(champion) -> {engage, control, frontline, scaling}
     * on 0–10 scales, or null when the champion carries no Data Dragon
     * info ratings (the caller then skips it).
     */
    function championScores(champion) {
        if (!champion || !champion.info) return null;
        const info = champion.info;
        const tags = champion.tags || [];
        let engage = 0, control = 0;
        tags.forEach(function (tag) {
            const base = TAG_BASELINES[tag];
            if (!base) return;
            if (base.engage > engage) engage = base.engage;
            if (base.control > control) control = base.control;
        });
        const eOver = ENGAGE_OVERRIDES[champion.id];
        if (eOver != null && eOver > engage) engage = eOver;
        const cOver = CONTROL_OVERRIDES[champion.id];
        if (cOver != null && cOver > control) control = cOver;
        let scaling = Math.max(info.attack || 0, info.magic || 0);
        if (tags.indexOf("Marksman") !== -1 || tags.indexOf("Mage") !== -1) {
            scaling += 1;
        }
        if (scaling > 10) scaling = 10;
        return {
            engage: engage,
            control: control,
            frontline: info.defense || 0,
            scaling: scaling
        };
    }

    function round1(x) {
        return Math.round(x * 10) / 10;
    }

    function mean(vals) {
        if (!vals.length) return 0;
        return vals.reduce(function (a, b) {
            return a + b;
        }, 0) / vals.length;
    }

    function top2Mean(scored, key) {
        const vals = scored.map(function (s) {
            return s[key];
        })
            .sort(function (a, b) {
                return b - a;
            })
            .slice(0, 2);
        return mean(vals);
    }

    /*
     * teamComposition(championsById, pickIds) ->
     *   { picks, engage, frontline, control, scaling, balance }
     * championsById: { championId: champion } from data/champions.json.
     * Aggregation per the rubric in the header comment.
     */
    function teamComposition(championsById, pickIds) {
        const scored = [];
        let sumAttack = 0, sumMagic = 0;
        (pickIds || []).forEach(function (id) {
            const champ = (championsById || {})[id];
            const s = championScores(champ);
            if (!s) return;
            scored.push(s);
            sumAttack += champ.info.attack || 0;
            sumMagic += champ.info.magic || 0;
        });
        let balance = 0;
        if (scored.length && (sumAttack + sumMagic) > 0) {
            balance = (1 - Math.abs(sumAttack - sumMagic) / (sumAttack + sumMagic)) * 10;
        }
        return {
            picks: scored.length,
            engage: round1(top2Mean(scored, "engage")),
            frontline: round1(top2Mean(scored, "frontline")),
            control: round1(mean(scored.map(function (s) {
                return s.control;
            }))),
            scaling: round1(mean(scored.map(function (s) {
                return s.scaling;
            }))),
            balance: round1(balance)
        };
    }

    /*
     * poolDepletion(profile, series) -> { roles: { role: {
     *   champions: [{champion, games, wins, available, reason}],
     *   total, remaining, alert } } } | null
     * profile is the RAW profile from data/scouting.json
     * (profiles[teamId], rolePools[role].champions = {id: {games, wins}}).
     * Returns null without a profile or a series.
     */
    function poolDepletion(profile, series) {
        if (!profile || !series) return null;
        const D = Draft();
        const fearless = D.fearlessPool(series);
        const pickedNow = {}, bannedNow = {};
        D.currentGame(series).actions.forEach(function (a) {
            if (a.type === "pick") pickedNow[a.championId] = true;
            else bannedNow[a.championId] = true;
        });
        const roles = {};
        ROLES.forEach(function (role) {
            const pool = (profile.rolePools || {})[role];
            let champs = [];
            if (pool && pool.champions) {
                champs = Object.keys(pool.champions).map(function (id) {
                    const c = pool.champions[id];
                    return {champion: id, games: c.games, wins: c.wins};
                }).sort(function (a, b) {
                    return (b.games - a.games) || (b.wins - a.wins) ||
                        (a.champion < b.champion ? -1 : a.champion > b.champion ? 1 : 0);
                }).slice(0, 5).map(function (c) {
                    const reason = fearless.has(c.champion) ? "fearless"
                        : pickedNow[c.champion] ? "picked"
                            : bannedNow[c.champion] ? "banned" : null;
                    return {
                        champion: c.champion, games: c.games, wins: c.wins,
                        available: !reason, reason: reason
                    };
                });
            }
            const remaining = champs.filter(function (c) {
                return c.available;
            }).length;
            roles[role] = {
                champions: champs,
                total: champs.length,
                remaining: remaining,
                alert: champs.length > 0 && remaining <= 1
            };
        });
        return {roles: roles};
    }

    const api = {
        ROLES: ROLES,
        TAG_BASELINES: TAG_BASELINES,
        ENGAGE_OVERRIDES: ENGAGE_OVERRIDES,
        CONTROL_OVERRIDES: CONTROL_OVERRIDES,
        championScores: championScores,
        teamComposition: teamComposition,
        poolDepletion: poolDepletion
    };

    if (typeof module !== "undefined" && module.exports) module.exports = api;
    global.Comp = api;
})(typeof window !== "undefined" ? window : globalThis);

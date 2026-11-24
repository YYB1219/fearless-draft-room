#!/usr/bin/env python3
"""
Build data/champions.json from Riot Data Dragon.

Fetches the current Data Dragon version + champion.json, then writes a slim
snapshot (id, name, nameZh, tags, approximated roles, info ratings) so the
app works offline. The `info` object carries Data Dragon's own 0–10 ratings
{attack, defense, magic} verbatim — js/comp.js builds the composition radar
on top of them (see the rubric documented there and in README).
Roles are approximated from a curated primary-role map (pro-play positions);
Data Dragon "tags" are class tags (Fighter/Mage/...), not positions, so a
curated map is required. Any champion missing from the map falls back to a
tag-based guess and is reported on stdout.

Chinese names: the zh_CN champion.json SWAPS the en_US field meanings —
its "name" is the epithet （九尾妖狐） and its "title" is the personal name
（阿狸） that the Chinese client and players actually use. nameZh therefore
comes from the zh_CN "title" field (Ahri -> 阿狸， LeeSin -> 李青，
Yasuo -> 亚索）. If the zh_CN fetch fails, the snapshot is written WITHOUT
nameZh (English names only) and a warning is printed — translations are
never invented.

Set DD_VERSION to pin a Data Dragon version (default: latest).

Usage: python3 tools/build_champions.py
"""
import json
import os
import urllib.request

# Curated primary + flex roles per champion id (pro-play positions, patch 16.x).
ROLES = {
    "Aatrox": ["Top"], "Ahri": ["Mid"], "Akali": ["Mid", "Top"], "Akshan": ["Mid"],
    "Alistar": ["Support"], "Ambessa": ["Top"], "Amumu": ["Jungle", "Support"],
    "Anivia": ["Mid"], "Annie": ["Mid", "Support"], "Aphelios": ["ADC"],
    "Ashe": ["ADC", "Support"], "AurelionSol": ["Mid"], "Aurora": ["Mid", "Top"],
    "Azir": ["Mid"], "Bard": ["Support"], "Belveth": ["Jungle"],
    "Blitzcrank": ["Support"], "Brand": ["Support", "Mid"], "Braum": ["Support"],
    "Briar": ["Jungle"], "Caitlyn": ["ADC"], "Camille": ["Top"],
    "Cassiopeia": ["Mid", "Top"], "Chogath": ["Top"], "Corki": ["ADC", "Mid"],
    "Darius": ["Top"], "Diana": ["Jungle", "Mid"], "DrMundo": ["Top", "Jungle"],
    "Draven": ["ADC"], "Ekko": ["Jungle", "Mid"], "Elise": ["Jungle"],
    "Evelynn": ["Jungle"], "Ezreal": ["ADC"], "Fiddlesticks": ["Jungle"],
    "Fiora": ["Top"], "Fizz": ["Mid"], "Galio": ["Mid", "Support"],
    "Gangplank": ["Top"], "Garen": ["Top"], "Gnar": ["Top"], "Gragas": ["Jungle", "Top"],
    "Graves": ["Jungle"], "Gwen": ["Top", "Jungle"], "Hecarim": ["Jungle"],
    "Heimerdinger": ["Mid", "Support"], "Hwei": ["Mid", "Support"], "Illaoi": ["Top"],
    "Irelia": ["Top", "Mid"], "Ivern": ["Jungle"], "Janna": ["Support"],
    "JarvanIV": ["Jungle"], "Jax": ["Top", "Jungle"], "Jayce": ["Top", "Mid"],
    "Jhin": ["ADC"], "Jinx": ["ADC"], "KSante": ["Top"], "Kaisa": ["ADC"],
    "Kalista": ["ADC"], "Karma": ["Support", "Mid"], "Karthus": ["Jungle", "Mid"],
    "Kassadin": ["Mid"], "Katarina": ["Mid"], "Kayle": ["Top", "Mid"],
    "Kayn": ["Jungle"], "Kennen": ["Top"], "Khazix": ["Jungle"], "Kindred": ["Jungle"],
    "Kled": ["Top"], "KogMaw": ["ADC"], "Leblanc": ["Mid"], "LeeSin": ["Jungle"],
    "Leona": ["Support"], "Lillia": ["Jungle"], "Lissandra": ["Mid"],
    "Locke": ["Mid"], "Lucian": ["ADC", "Mid"], "Lulu": ["Support"],
    "Lux": ["Support", "Mid"], "Malphite": ["Top"], "Malzahar": ["Mid"],
    "Maokai": ["Jungle", "Support", "Top"], "MasterYi": ["Jungle"], "Mel": ["Mid", "Support"],
    "Milio": ["Support"], "MissFortune": ["ADC"], "MonkeyKing": ["Jungle", "Top"],
    "Mordekaiser": ["Top"], "Morgana": ["Support", "Mid"], "Naafiri": ["Jungle", "Mid"],
    "Nami": ["Support"], "Nasus": ["Top"], "Nautilus": ["Support"],
    "Neeko": ["Support", "Mid"], "Nidalee": ["Jungle"], "Nilah": ["ADC"],
    "Nocturne": ["Jungle"], "Nunu": ["Jungle"], "Olaf": ["Top", "Jungle"],
    "Orianna": ["Mid"], "Ornn": ["Top"], "Pantheon": ["Jungle", "Support", "Top"],
    "Poppy": ["Jungle", "Support", "Top"], "Pyke": ["Support"], "Qiyana": ["Jungle", "Mid"],
    "Quinn": ["Top"], "Rakan": ["Support"], "Rammus": ["Jungle"], "RekSai": ["Jungle"],
    "Rell": ["Support", "Jungle"], "Renata": ["Support"], "Renekton": ["Top"],
    "Rengar": ["Jungle"], "Riven": ["Top"], "Rumble": ["Top"], "Ryze": ["Mid"],
    "Samira": ["ADC"], "Sejuani": ["Jungle"], "Senna": ["Support", "ADC"],
    "Seraphine": ["Support", "ADC", "Mid"], "Sett": ["Top", "Support"],
    "Shaco": ["Jungle", "Support"], "Shen": ["Top", "Support"], "Shyvana": ["Jungle"],
    "Singed": ["Top"], "Sion": ["Top"], "Sivir": ["ADC"], "Skarner": ["Jungle"],
    "Smolder": ["ADC", "Mid"], "Sona": ["Support"], "Soraka": ["Support"],
    "Swain": ["Support", "Mid"], "Sylas": ["Mid", "Jungle"], "Syndra": ["Mid"],
    "TahmKench": ["Support", "Top"], "Taliyah": ["Mid", "Jungle"], "Talon": ["Jungle", "Mid"],
    "Taric": ["Support"], "Teemo": ["Top"], "Thresh": ["Support"],
    "Tristana": ["ADC", "Mid"], "Trundle": ["Jungle", "Top"], "Tryndamere": ["Top"],
    "TwistedFate": ["Mid"], "Twitch": ["ADC"], "Udyr": ["Jungle", "Top"],
    "Urgot": ["Top"], "Varus": ["ADC"], "Vayne": ["ADC", "Top"], "Veigar": ["Mid"],
    "Velkoz": ["Mid", "Support"], "Vex": ["Mid"], "Vi": ["Jungle"], "Viego": ["Jungle"],
    "Viktor": ["Mid"], "Vladimir": ["Mid", "Top"], "Volibear": ["Top", "Jungle"],
    "Warwick": ["Jungle", "Top"], "Xayah": ["ADC"], "Xerath": ["Mid", "Support"],
    "XinZhao": ["Jungle"], "Yasuo": ["Mid", "Top", "ADC"], "Yone": ["Mid", "Top"],
    "Yorick": ["Top"], "Yunara": ["ADC"], "Yuumi": ["Support"], "Zaahen": ["Top"],
    "Zac": ["Jungle"], "Zed": ["Mid", "Jungle"], "Zeri": ["ADC"], "Ziggs": ["ADC", "Mid"],
    "Zilean": ["Support", "Mid"], "Zoe": ["Mid"], "Zyra": ["Support"],
}

TAG_FALLBACK = {
    "Marksman": "ADC", "Support": "Support", "Mage": "Mid",
    "Assassin": "Mid", "Fighter": "Top", "Tank": "Top",
}


def main():
    version = os.environ.get("DD_VERSION")
    if not version:
        versions = json.load(urllib.request.urlopen(
            "https://ddragon.leagueoflegends.com/api/versions.json"))
        version = versions[0]
    raw = json.load(urllib.request.urlopen(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"))

    # Chinese display names from the SAME Data Dragon version. NOTE: zh_CN
    # swaps the en_US field meanings — zh "title" is the personal name
    # （阿狸） and zh "name" is the epithet （九尾妖狐）. nameZh = zh "title".
    zh_names = {}
    try:
        zh_raw = json.load(urllib.request.urlopen(
            f"https://ddragon.leagueoflegends.com/cdn/{version}/data/zh_CN/champion.json"))
        zh_names = {cid: c["title"] for cid, c in zh_raw["data"].items()}
    except Exception as e:  # noqa: BLE001 — report and ship EN-only, never invent
        print(f"WARNING: zh_CN fetch failed ({e}); writing English names only, no nameZh.")

    champs, missing = [], []
    for cid, c in sorted(raw["data"].items(), key=lambda kv: kv[1]["name"]):
        roles = ROLES.get(cid)
        if not roles:
            roles = [TAG_FALLBACK.get(c["tags"][0], "Mid")]
            missing.append(cid)
        entry = {
            "id": cid,
            "key": int(c["key"]),
            "name": c["name"],
        }
        if cid in zh_names:
            entry["nameZh"] = zh_names[cid]
        entry.update({
            "title": c["title"],
            "tags": c["tags"],
            "info": {
                "attack": c["info"]["attack"],
                "defense": c["info"]["defense"],
                "magic": c["info"]["magic"],
            },
            "roles": roles,
            "icon": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{cid}.png",
        })
        champs.append(entry)
    out = {"ddragonVersion": version, "champions": champs}
    with open("data/champions.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote data/champions.json: {len(champs)} champions, Data Dragon {version}, "
          f"{sum(1 for c in champs if 'nameZh' in c)} with nameZh")
    if missing:
        print("WARNING: role fallback used for:", ", ".join(missing))


if __name__ == "__main__":
    main()

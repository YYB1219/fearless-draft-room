#!/usr/bin/env python3
"""
Build data/champions.json from Riot Data Dragon.

Fetches the current Data Dragon version + champion.json, then writes a slim
snapshot (id, name, tags, approximated roles) so the app works offline.
Roles are approximated from a curated primary-role map (pro-play positions);
Data Dragon "tags" are class tags (Fighter/Mage/...), not positions, so a
curated map is required. Any champion missing from the map falls back to a
tag-based guess and is reported on stdout.

Usage: python3 tools/build_champions.py
"""
import json
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
    versions = json.load(urllib.request.urlopen(
        "https://ddragon.leagueoflegends.com/api/versions.json"))
    version = versions[0]
    raw = json.load(urllib.request.urlopen(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json"))
    champs, missing = [], []
    for cid, c in sorted(raw["data"].items(), key=lambda kv: kv[1]["name"]):
        roles = ROLES.get(cid)
        if not roles:
            roles = [TAG_FALLBACK.get(c["tags"][0], "Mid")]
            missing.append(cid)
        champs.append({
            "id": cid,
            "key": int(c["key"]),
            "name": c["name"],
            "title": c["title"],
            "tags": c["tags"],
            "roles": roles,
            "icon": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{cid}.png",
        })
    out = {"ddragonVersion": version, "champions": champs}
    with open("data/champions.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote data/champions.json: {len(champs)} champions, Data Dragon {version}")
    if missing:
        print("WARNING: role fallback used for:", ", ".join(missing))


if __name__ == "__main__":
    main()

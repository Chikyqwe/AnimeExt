# agrega id a el json de anime_list en ./jsons/anime_list.json 
# run with: python main.py
import json
import os
from pathlib import Path
def add_id_to_anime_list():
    json_path = Path("./jsons/anime_list.json")
    
    if not json_path.exists():
        print(f"Error: {json_path} does not exist.")
        return

    with open(json_path, "r", encoding="utf-8") as file:
        anime_list = json.load(file)

    for index, anime in enumerate(anime_list):
        anime["id"] = index + 1

    with open(json_path, "w", encoding="utf-8") as file:
        json.dump(anime_list, file, indent=4, ensure_ascii=False)

    print(f"Updated {len(anime_list)} anime entries with IDs.")
if __name__ == "__main__":
    add_id_to_anime_list()
    print("ID addition completed successfully.")
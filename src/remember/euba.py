# -----First version of AnimeExt , we will remember for ever-----
"""
import asyncio
import re
import json
import os
import requests
from playwright.async_api import async_playwright, TimeoutError
from datetime import datetime

JSON_FOLDER = "./jsons"
os.makedirs(JSON_FOLDER, exist_ok=True)
MAX_CONCURRENT = 5
recolect_ep = 0
total_urls = 0


def log(msg, color_name):
    print(msg)


def next_url(base_url):
    match = re.search(r"^(.*-)(\d+)$", base_url)
    if not match:
        return None
    base, num = match.groups()
    num = int(num) + 1
    return f"{base}{num}"


def is_url_valid(url):
    try:
        resp = requests.head(url, timeout=5)
        return resp.status_code != 404
    except requests.RequestException:
        return False


def get_all_urls(base_url):
    global total_urls
    urls = []
    current_url = base_url

    if not is_url_valid(current_url):
        log(f"The base URL is not valid: {current_url}", "rojo")
        return urls

    urls.append(current_url)

    while True:
        current_url = next_url(current_url)
        if current_url is None:
            log("Could not detect number to increment in URL.", "amarillo")
            break
        if not is_url_valid(current_url):
            log(f"URL not found (404): {current_url}", "rojo")
            break
        log(f"Valid URL: {current_url}", "verde")
        urls.append(current_url)

    total_urls = len(urls)
    return urls


async def extract_sw_url(context, url, episode_num):
    global recolect_ep
    page = await context.new_page()
    log(f"[{episode_num}] Opening page: {url}", "cian")

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        content = await page.content()

        videos = None
        m = re.search(r"var videos\s*=\s*(\{.*?\});", content, re.DOTALL)
        if m:
            try:
                videos = json.loads(m.group(1))
            except Exception as e:
                log(f"[!] Error parsing JSON videos in episode {episode_num}: {e}", "rojo")

        if not videos:
            log(f"[!] 'var videos' not found in episode {episode_num}", "rojo")
            await page.close()
            return None

        sw_code = None
        for options in videos.values():
            for server in options:
                if server.get("server", "").lower() == "sw" or server.get("title", "").lower() == "sw":
                    sw_code = server.get("code")
                    break
            if sw_code:
                break

        if not sw_code:
            log(f"[!] SW server not found in episode {episode_num}", "rojo")
            await page.close()
            return None

        log(f"[{episode_num}] SW server video URL: {sw_code}", "magenta")
        detected_url = None

        async def intercept(route):
            nonlocal detected_url
            if "master.m3u8" in route.request.url:
                detected_url = route.request.url.replace("master.m3u8", "")
                log(f"[SW DETECTED] {detected_url}", "verde")
                recolect_ep += 1
                await route.abort()
            else:
                await route.continue_()

        sw_page = await context.new_page()
        await sw_page.route("**/*", intercept)
        try:
            await sw_page.goto(sw_code, wait_until="domcontentloaded", timeout=80000)
            await sw_page.wait_for_timeout(21000)
        except TimeoutError:
            log(f"[!] Timeout opening SW server episode {episode_num}", "rojo")

        await sw_page.close()
        await page.close()
        return detected_url

    except Exception as e:
        log(f"[!] Error in episode {episode_num}: {e}", "rojo")
        await page.close()
        return None


async def extract_stape_url(context, url, episode_num):
    global recolect_ep
    log(f"===== [EPISODIO {episode_num}] INICIO EXTRACCIÓN STAPE =====", "amarillo")
    log(f"[INFO] Visitando página de AnimeFLV: {url}", "cian")

    page = await context.new_page()
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        log("[OK] Página cargada correctamente.", "verde")
    except Exception as e:
        log(f"[ERROR] Fallo al visitar página AnimeFLV: {e}", "rojo")
        await page.close()
        return None

    content = await page.content()
    m = re.search(r"var videos\s*=\s*(\{.*?\});", content, re.DOTALL)
    if not m:
        log("[ERROR] No se encontró la variable 'videos'.", "rojo")
        await page.close()
        return None

    try:
        videos = json.loads(m.group(1))
        log("[OK] JSON de 'videos' parseado correctamente.", "verde")
    except Exception as e:
        log(f"[ERROR] Error al parsear JSON: {e}", "rojo")
        await page.close()
        return None

    stape_code = None
    for calidad, servers in videos.items():
        for server in servers:
            if "stape" in server.get("server", "").lower():
                stape_code = server.get("code")
                log(f"[OK] Código STAPE encontrado: {stape_code}", "verde")
                break
        if stape_code:
            break

    await page.close()

    if not stape_code:
        log("[ERROR] No se encontró código STAPE.", "rojo")
        return None

    log(f"[INFO] Abriendo iframe del servidor STAPE: {stape_code}", "cian")
    detected_url = None

    async def intercept(route):
        nonlocal detected_url
        req_url = route.request.url
        log(f"[INTERCEPT] URL detectada: {req_url}", "magenta")
        if ".mp4" in req_url:
            detected_url = req_url
            log(f"[STAPE DETECTADO] URL MP4 directa: {detected_url}", "amarillo")
            await route.abort()
        elif "streamtape.com/get_video" in req_url:
            log(f"[STAPE DETECTADO] URL de tipo redirección: {req_url}", "amarillo")
            await route.abort()
            log("[INFO] Visitando URL para seguir redirección...", "cian")
            temp_page = await context.new_page()
            try:
                response = await temp_page.goto(req_url, wait_until="load", timeout=30000)
                if response:
                    redirected_url = response.url
                    log(f"[OK] URL redirigida detectada: {redirected_url}", "verde")
                    detected_url = redirected_url
                else:
                    log("[ERROR] No se pudo obtener redirección.", "rojo")
            except Exception as e:
                log(f"[ERROR] Fallo al seguir redirección: {e}", "rojo")
            await temp_page.close()
        else:
            await route.continue_()

    stape_page = await context.new_page()
    await stape_page.route("**/*", intercept)
    try:
        await stape_page.goto(stape_code, timeout=80000)
        log("[OK] Página STAPE cargada.", "verde")
        await stape_page.wait_for_timeout(25000)
        log("[INFO] Tiempo de espera completado para carga del reproductor.", "cian")
    except Exception as e:
        log(f"[ERROR] Fallo al cargar iframe STAPE: {e}", "rojo")
    await stape_page.close()

    if detected_url:
        log(f"[SUCCESS] Enlace MP4 STAPE extraído: {detected_url}", "verde")
        recolect_ep += 1
    else:
        log("[FAIL] No se detectó ningún enlace MP4 válido.", "rojo")

    log(f"===== [EPISODIO {episode_num}] FIN EXTRACCIÓN STAPE =====", "amarillo")
    return detected_url


async def worker(sem, context, url, idx, results):
    async with sem:
        max_retries = 3
        detected_url = None
        for attempt in range(1, max_retries + 1):
            detected_url = await extract_sw_url(context, url, idx + 1)
            if detected_url is not None:
                break
            log(f"[Warning] Retry {attempt}/{max_retries} for SW - Episode {idx + 1}", "amarillo")
            await asyncio.sleep(2)

        if detected_url is None:
            log(f"[Failed] SW failed for episode {idx + 1}, trying STAPE", "rojo")
            detected_url = await extract_stape_url(context, url, idx + 1)

        episode_data = {"episode_url": url}
        if detected_url:
            if ".mp4" in detected_url:
                episode_data["mp4"] = detected_url
            else:
                episode_data["m3u8"] = detected_url
        results[str(idx + 1)] = episode_data


def recolect(base_url):
    return asyncio.run(main_init(base_url))


def status():
    global recolect_ep, total_urls
    return f"{recolect_ep}/{total_urls}"


async def main_init(base_url):
    global recolect_ep, total_urls
    urls = get_all_urls(base_url)
    if not urls:
        log("[Failed] No valid URLs found.", "rojo")
        return None

    sem = asyncio.Semaphore(MAX_CONCURRENT)

    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        )
        results = {}
        tasks = [worker(sem, context, url, idx, results) for idx, url in enumerate(urls)]
        await asyncio.gather(*tasks)
        await browser.close()

    anime_name = base_url.split("/ver/")[-1].rsplit("-", 1)[0]
    anime_name = re.sub(r'[\\/*?:"<>|]', "", anime_name).strip()
    anime_name = re.sub(r"\s+", "_", anime_name).lower()
    filename = os.path.join(JSON_FOLDER, f"{anime_name}.json")

    output_data = {
        "date": datetime.now().isoformat(),
        "url_original": base_url,
        "episodes": results
    }

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    log(f"[SAVED] Results stored in: {filename}", "cian")
    recolect_ep = 0
    total_urls = 0
    return filename


# Permite: from euba import recolect
__all__ = ["recolect", "status"]


def cli():
    import sys
    if len(sys.argv) < 2:
        log("Usage: python -m euba https://www3.animeflv.net/ver/example-1", "amarillo")
        sys.exit(1)
    base_url = sys.argv[1]
    asyncio.run(recolect(base_url))


if __name__ == "__main__":
    cli()
"""
import requests
import concurrent.futures

# Configuración
TARGET_URL = "https://httpbin.org/post"
BLOCK_SIZE_MB = 5
TOTAL_GB = 10
BLOCK_SIZE = BLOCK_SIZE_MB * 1024 * 1024  # en bytes
TOTAL_BLOCKS = (TOTAL_GB * 1024) // BLOCK_SIZE_MB  # 2048 bloques de 5 MB para 10 GB
MAX_WORKERS = 10  # Número de hilos paralelos

# Bloque de datos a enviar
data_block = b'a' * BLOCK_SIZE

def send_block(index):
    try:
        response = requests.post(TARGET_URL, data=data_block, timeout=15)
        print(f"[{index}] OK - Status: {response.status_code}")
    except Exception as e:
        print(f"[{index}] Error: {e}")

# Envío en paralelo
with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = [executor.submit(send_block, i+1) for i in range(TOTAL_BLOCKS)]
    concurrent.futures.wait(futures)

print(f"✅ Listo: Se intentó subir {TOTAL_GB} GB en bloques de {BLOCK_SIZE_MB} MB.")

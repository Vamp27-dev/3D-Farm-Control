import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STORAGE_PATH = os.path.join(BASE_DIR, "storage")

os.makedirs(STORAGE_PATH, exist_ok=True)
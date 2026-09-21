import os
from dotenv import load_dotenv
import duckdb

# Load .env from ml/ or parent directory
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

duckdb_path = os.getenv("DUCKDB_PATH")

print("--------------------------------------------------")
print(f"DUCKDB_PATH is set to: {duckdb_path}")
print("--------------------------------------------------")

if not duckdb_path:
    print("❌ DUCKDB_PATH is empty! Make sure you added it to your .env file.")
    exit(1)

try:
    print("Connecting to DuckDB...")
    conn = duckdb.connect(duckdb_path)
    databases = conn.execute("SHOW DATABASES").fetchall()
    print("✅ SUCCESS! Connected to MotherDuck Cloud!")
    print(f"Databases available: {databases}")
    conn.close()
except Exception as e:
    print(f"❌ Connection error: {e}")

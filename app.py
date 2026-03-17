import argparse
import json
import sqlite3
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
LOCAL_CONFIG = PROJECT_DIR / "local_config.json"
JOINED_SQL = PROJECT_DIR / "joined_catalog.sql"


def load_config() -> dict:
    if not LOCAL_CONFIG.exists():
        raise FileNotFoundError(
            f"Missing {LOCAL_CONFIG}. Copy local_config.example.json to local_config.json and fill in your local paths."
        )
    return json.loads(LOCAL_CONFIG.read_text())


def resolve_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = (PROJECT_DIR / path).resolve()
    return path


def connect() -> sqlite3.Connection:
    config = load_config()
    photos_library = resolve_path(config["photos_library_path"])
    photos_db = photos_library / "database" / "Photos.sqlite"
    enrichment_db = resolve_path(config.get("enrichment_db_path", "./enrichment.db"))
    uri = f"file:{photos_db}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute(f"ATTACH DATABASE '{enrichment_db}' AS enrich")
    return conn


def fetch_rows(limit: int) -> list[dict]:
    joined_query = JOINED_SQL.read_text()
    with connect() as conn:
        rows = conn.execute(joined_query, (limit,)).fetchall()
    return [dict(row) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    rows = fetch_rows(args.limit)
    print(json.dumps(rows, indent=2, default=str))


if __name__ == "__main__":
    main()

import argparse
from functools import lru_cache
import json
import re
import sqlite3
import uuid
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
LOCAL_CONFIG = PROJECT_DIR / "local_config.json"
JOINED_SQL = PROJECT_DIR / "joined_catalog.sql"


@lru_cache(maxsize=1)
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


def get_photos_library_path() -> Path:
    config = load_config()
    return resolve_path(config["photos_library_path"])


def get_photos_db_path() -> Path:
    return get_photos_library_path() / "database" / "Photos.sqlite"


def get_enrichment_db_path() -> Path:
    config = load_config()
    return resolve_path(config.get("enrichment_db_path", "./enrichment.db"))


def get_schema_path() -> Path:
    return PROJECT_DIR / "schema_enrichment.sql"


@lru_cache(maxsize=1)
def load_joined_query() -> str:
    return JOINED_SQL.read_text().strip().rstrip(";")


def uuid_to_psi_hi(uuid_text: str | None) -> int | None:
    if not uuid_text:
        return None
    raw = uuid.UUID(uuid_text).bytes
    return int.from_bytes(raw[:8], "little", signed=True)


def uuid_to_psi_lo(uuid_text: str | None) -> int | None:
    if not uuid_text:
        return None
    raw = uuid.UUID(uuid_text).bytes
    return int.from_bytes(raw[8:], "little", signed=True)


def search_matches(text: str | None, query: str | None) -> int:
    if not text or not query:
        return 0
    normalized_query = query.strip()
    if not normalized_query:
        return 0
    pattern = re.compile(rf"(?<![0-9A-Za-z]){re.escape(normalized_query)}(?![0-9A-Za-z])", re.IGNORECASE)
    return 1 if pattern.search(text) else 0


def ensure_enrichment_db(enrichment_db: Path) -> None:
    enrichment_db.parent.mkdir(parents=True, exist_ok=True)
    if enrichment_db.exists():
        return
    bootstrap = sqlite3.connect(enrichment_db)
    try:
        bootstrap.executescript(get_schema_path().read_text())
    finally:
        bootstrap.close()


def connect() -> sqlite3.Connection:
    photos_db = get_photos_db_path()
    enrichment_db = get_enrichment_db_path()
    search_db = get_photos_library_path() / "database" / "search" / "psi.sqlite"
    ensure_enrichment_db(enrichment_db)
    uri = f"file:{photos_db}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.create_function("uuid_to_psi_hi", 1, uuid_to_psi_hi)
    conn.create_function("uuid_to_psi_lo", 1, uuid_to_psi_lo)
    conn.create_function("search_matches", 2, search_matches)
    safe_enrichment_db = str(enrichment_db).replace("'", "''")
    safe_search_db = str(search_db).replace("'", "''")
    try:
        conn.execute(f"ATTACH DATABASE '{safe_enrichment_db}' AS enrich")
    except sqlite3.OperationalError as exc:
        conn.close()
        raise sqlite3.OperationalError(
            f"Failed to attach enrichment database at {enrichment_db}: {exc}"
        ) from exc
    try:
        conn.execute(f"ATTACH DATABASE '{safe_search_db}' AS psi")
    except sqlite3.OperationalError as exc:
        conn.close()
        raise sqlite3.OperationalError(
            f"Failed to attach search database at {search_db}: {exc}"
        ) from exc
    return conn


def fetch_rows(limit: int) -> list[dict]:
    joined_query = load_joined_query() + " ORDER BY created_utc DESC LIMIT ?"
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

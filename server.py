import mimetypes
import shlex
from pathlib import Path
from typing import Mapping

from flask import Flask, Response, abort, jsonify, render_template, request, send_file

from app import connect, connect_photos_only, get_photos_library_path, load_joined_query


PROJECT_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = PROJECT_DIR / "templates"
STATIC_DIR = PROJECT_DIR / "static"


def create_app() -> Flask:
    app = Flask(__name__, template_folder=str(TEMPLATES_DIR), static_folder=str(STATIC_DIR))
    photos_library = get_photos_library_path()
    base_query = load_joined_query()

    def asset_absolute_path(original_path: str) -> Path:
        asset_path = (photos_library / original_path).resolve()
        try:
            asset_path.relative_to(photos_library.resolve())
        except ValueError as exc:
            raise PermissionError("Resolved path escaped the Photos library") from exc
        return asset_path

    def clean_value(value: object) -> object:
        if isinstance(value, str):
            return value.replace("\x00", "")
        return value

    def parse_search_terms(raw_query: str) -> list[tuple[str, bool]]:
        raw_query = raw_query.strip()
        if not raw_query:
            return []
        try:
            terms = shlex.split(raw_query)
        except ValueError:
            terms = raw_query.split()
        parsed_terms: list[tuple[str, bool]] = []
        for term in terms:
            cleaned = term.strip()
            if not cleaned:
                continue
            is_negative = cleaned.startswith("-") and len(cleaned) > 1
            if is_negative:
                cleaned = cleaned[1:].strip()
            if cleaned:
                parsed_terms.append((cleaned, is_negative))
        return parsed_terms

    def asset_row_to_dict(row: Mapping[str, object]) -> dict:
        payload = {key: clean_value(value) for key, value in dict(row).items()}
        payload["media_url"] = f"/media/original/{payload['asset_uuid']}"
        return payload

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/assets")
    def list_assets():
        query = request.args.get("q", "").strip().lower()
        terms = parse_search_terms(query)
        limit = min(max(request.args.get("limit", default=50, type=int), 1), 200)
        offset = max(request.args.get("offset", default=0, type=int), 0)
        include_inferred = request.args.get("include_inferred", "1") not in {"0", "false", "False"}

        sql = f"""
        SELECT *
        FROM (
          {base_query}
        ) catalog
        """
        params: list[object] = []
        if terms:
            term_clauses: list[str] = []
            for term, is_negative in terms:
                clause = """
                (
                  search_matches(coalesce(title, ''), ?)
                  OR search_matches(coalesce(description, ''), ?)
                  OR search_matches(coalesce(original_filename, ''), ?)
                  OR search_matches(coalesce(keywords, ''), ?)
                  OR search_matches(coalesce(albums, ''), ?)
                  OR search_matches(coalesce(summary, ''), ?)
                  OR search_matches(coalesce(notes, ''), ?)
                  OR search_matches(coalesce(generated_tags, ''), ?)
                  OR search_matches(coalesce(search_text, ''), ?)
                """
                params.extend([term] * 9)

                if include_inferred:
                    clause += """
                  OR EXISTS (
                    SELECT 1
                    FROM psi.assets pa
                    JOIN psi.ga pga
                      ON pga.assetid = pa.rowid
                    JOIN psi.groups pg
                      ON pg.rowid = pga.groupid
                    WHERE pa.uuid_0 = uuid_to_psi_hi(catalog.asset_uuid)
                      AND pa.uuid_1 = uuid_to_psi_lo(catalog.asset_uuid)
                      AND search_matches(coalesce(pg.normalized_string, ''), ?)
                  )
                    """
                    params.append(term)

                clause += "\n                )"
                term_clauses.append(f"NOT {clause}" if is_negative else clause)

            sql += "\nWHERE " + "\n  AND ".join(term_clauses)

        sql += " ORDER BY created_utc DESC LIMIT ? OFFSET ?"
        params.extend([limit + 1, offset])

        with connect() as conn:
            rows = conn.execute(sql, params).fetchall()

        has_more = len(rows) > limit
        items = [asset_row_to_dict(row) for row in rows[:limit]]
        return jsonify({
            "items": items,
            "has_more": has_more,
            "next_offset": offset + len(items),
        })

    @app.get("/api/assets/<asset_uuid>")
    def get_asset(asset_uuid: str):
        sql = f"""
        SELECT *
        FROM (
          {base_query}
        ) catalog
        WHERE asset_uuid = ?
        LIMIT 1
        """
        with connect() as conn:
            row = conn.execute(sql, (asset_uuid,)).fetchone()
        if row is None:
            abort(404, description="Asset not found")
        return jsonify(asset_row_to_dict(row))

    @app.get("/media/original/<asset_uuid>")
    def get_original(asset_uuid: str):
        sql = """
        SELECT
          ZUUID AS asset_uuid,
          'originals/' || ZDIRECTORY || '/' || ZFILENAME AS original_path,
          ZFILENAME AS current_filename,
          ZUNIFORMTYPEIDENTIFIER AS uti
        FROM ZASSET
        WHERE ZUUID = ?
          AND ZTRASHEDSTATE = 0
        LIMIT 1
        """
        with connect_photos_only() as conn:
            row = conn.execute(sql, (asset_uuid,)).fetchone()
        if row is None:
            abort(404, description="Asset not found")

        asset_path = asset_absolute_path(row["original_path"])
        if not asset_path.exists():
            abort(404, description="Original file not found")

        mimetype = mimetypes.guess_type(row["current_filename"])[0]
        if (mimetype or "").startswith("image/"):
            return Response(asset_path.read_bytes(), mimetype=mimetype or "application/octet-stream")
        return send_file(asset_path, mimetype=mimetype or "application/octet-stream")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=8000)

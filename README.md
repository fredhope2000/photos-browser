# Photos Browser

A read-only analysis and browsing project for an Apple Photos library.

## Current approach

- Treat the Photos library package as read-only.
- Use `database/Photos.sqlite` inside your local Photos library as the primary metadata source.
- Use `database/search/psi.sqlite` for Apple-inferred search concepts such as scene/object labels.
- Ignore `photos.db` for catalog work; it is deprecated bookkeeping and was replaced by `Photos.sqlite`.
- Store machine-specific paths in `local_config.json`, which should stay out of version control.

## Features

- Search across Photos metadata with explicit keywords and optional inferred keywords.
- Boolean-style search:
  - space-separated terms are combined with `AND`
  - quoted phrases are treated as exact multi-word terms
  - a leading `-` means `NOT`
- Two result layouts:
  - `List view`
  - `Grid view`
- Infinite scroll in the results pane.
- Independent scrolling for results and detail panes.
- Draggable divider between the left and right panes.
- Local UI preferences saved in `localStorage`:
  - layout mode
  - include inferred keywords
  - pane width
- Search results can use:
  - explicit Photos keywords from `Photos.sqlite`
  - inferred Apple search labels from `psi.sqlite`

## Search syntax

Examples:

- `fig "whole plant"`
- `cherry -container`
- `cherry -"whole plant"`
- `bee`

Semantics:

- `fig whole` means both terms must match somewhere on the asset.
- `"whole plant"` means that exact phrase.
- `-container` excludes matches containing `container`.
- The `Include inferred keywords` checkbox controls whether Apple-inferred `psi.sqlite` labels are included in search matching.

## Key files

- `joined_catalog.sql`: full query used by the app, including enrichment joins.
- `schema_enrichment.sql`: schema for generated annotations stored outside the Photos library.
- `app.py`: shared database/config helpers plus a small CLI preview path.
- `server.py`: Flask app that exposes JSON asset endpoints and streams originals from the Photos library.
- `templates/`: HTML for the local web UI.
- `static/`: browser-side JS and CSS for the UI.
- `local_config.example.json`: template for your machine-specific local configuration.
- `.gitignore`: ignores `local_config.json` and local SQLite artifacts.

## Setup

```bash
cp local_config.example.json local_config.json
```

Edit `local_config.json` and set:

- `photos_library_path`: absolute path to your `Photos Library.photoslibrary`
- `enrichment_db_path`: where to store your generated metadata DB; `./enrichment.db` is a reasonable default

Then initialize the enrichment database:

```bash
sqlite3 enrichment.db < schema_enrichment.sql
```

Preview the joined catalog from the CLI:

```bash
python3 app.py --limit 5
```

Run the local web app:

```bash
python3 server.py
```

Then open `http://127.0.0.1:8000`.

## API

- `GET /api/assets`
  - query params:
    - `q`
    - `limit`
    - `offset`
    - `include_inferred`
  - response shape:
    - `items`
    - `has_more`
    - `next_offset`
- `GET /api/assets/<asset_uuid>`
- `GET /media/original/<asset_uuid>`

## Notes

- `ZASSET.ZDATECREATED` is stored in Apple's 2001 epoch and needs `+ 978307200` to convert to Unix time.
- `ZLATITUDE` and `ZLONGITUDE` values of `-180` should be treated as missing location data.
- `originals/<ZDIRECTORY>/<ZFILENAME>` reconstructs the current original file path inside the library package.
- Use `ZASSET.ZUUID` as the primary key for your own generated data.
- Photos-native keywords are the preferred source for human-managed tags.
- The separate enrichment database is best used for derived metadata such as notes, summaries, normalized places, or machine-generated search fields.
- Thumbnail/original media fetches do not depend on `enrichment.db`; media lookup is done against `Photos.sqlite` directly.
- `joined_catalog.sql` contains no machine-specific paths or user-specific text.
- The web app serves originals through backend routes such as `/media/original/<asset_uuid>`, so the browser never reads the Photos library package directly.

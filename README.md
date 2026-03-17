# Photos Browser

A read-only analysis and browsing project for an Apple Photos library.

## Current approach

- Treat the Photos library package as read-only.
- Use `database/Photos.sqlite` inside your local Photos library as the primary metadata source.
- Ignore `photos.db` for catalog work; it is deprecated bookkeeping and was replaced by `Photos.sqlite`.
- Store machine-specific paths in `local_config.json`, which should stay out of version control.

## Useful files

- `joined_catalog.sql`: full query used by the app, including enrichment joins.
- `schema_enrichment.sql`: schema for generated annotations stored outside the Photos library.
- `app.py`: Python entrypoint that opens the Photos DB read-only, attaches the enrichment DB, and queries a unified catalog.
- `server.py`: Flask app that exposes JSON asset endpoints and streams originals from the Photos library.
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

Preview the joined catalog:

```bash
python3 app.py --limit 5
```

Run the local web app:

```bash
python3 server.py
```

Then open `http://127.0.0.1:8000`.

## Notes

- `ZASSET.ZDATECREATED` is stored in Apple's 2001 epoch and needs `+ 978307200` to convert to Unix time.
- `ZLATITUDE` and `ZLONGITUDE` values of `-180` should be treated as missing location data.
- `originals/<ZDIRECTORY>/<ZFILENAME>` reconstructs the current original file path inside the library package.
- Use `ZASSET.ZUUID` as the primary key for your own generated data.
- Photos-native keywords are the preferred source for human-managed tags.
- The separate enrichment database is best used for derived metadata such as notes, summaries, normalized places, or machine-generated search fields.
- `joined_catalog.sql` contains no machine-specific paths or user-specific text.
- The web app serves originals through backend routes such as `/media/original/<asset_uuid>`, so the browser never reads the Photos library package directly.

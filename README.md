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

## Notes

- `ZASSET.ZDATECREATED` is stored in Apple's 2001 epoch and needs `+ 978307200` to convert to Unix time.
- `ZLATITUDE` and `ZLONGITUDE` values of `-180` should be treated as missing location data.
- `originals/<ZDIRECTORY>/<ZFILENAME>` reconstructs the current original file path inside the library package.
- Use `ZASSET.ZUUID` as the primary key for your own generated data.
- `joined_catalog.sql` contains no machine-specific paths or user-specific text.

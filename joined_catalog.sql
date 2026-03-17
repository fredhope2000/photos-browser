WITH keyword_agg AS (
  SELECT
    jk.Z_1ASSETATTRIBUTES AS asset_attr_pk,
    group_concat(k.ZTITLE, '; ') AS keywords
  FROM Z_1KEYWORDS jk
  JOIN ZKEYWORD k
    ON k.Z_PK = jk.Z_52KEYWORDS
  GROUP BY jk.Z_1ASSETATTRIBUTES
),
album_agg AS (
  SELECT
    j.Z_3ASSETS AS asset_pk,
    group_concat(g.ZTITLE, '; ') AS albums
  FROM Z_33ASSETS j
  JOIN ZGENERICALBUM g
    ON g.Z_PK = j.Z_33ALBUMS
  WHERE coalesce(g.ZTITLE, '') <> ''
  GROUP BY j.Z_3ASSETS
),
generated_tags AS (
  SELECT
    asset_uuid,
    group_concat(tag, '; ') AS generated_tags
  FROM enrich.asset_tags
  GROUP BY asset_uuid
)
SELECT
  a.ZUUID AS asset_uuid,
  'originals/' || a.ZDIRECTORY || '/' || a.ZFILENAME AS original_path,
  a.ZFILENAME AS current_filename,
  aa.ZORIGINALFILENAME AS original_filename,
  datetime(a.ZDATECREATED + 978307200, 'unixepoch') AS created_utc,
  datetime(a.ZADDEDDATE + 978307200, 'unixepoch') AS added_utc,
  CASE
    WHEN a.ZLATITUDE = -180 OR a.ZLONGITUDE = -180 THEN NULL
    ELSE a.ZLATITUDE
  END AS latitude,
  CASE
    WHEN a.ZLATITUDE = -180 OR a.ZLONGITUDE = -180 THEN NULL
    ELSE a.ZLONGITUDE
  END AS longitude,
  a.ZKIND AS kind,
  a.ZWIDTH AS width,
  a.ZHEIGHT AS height,
  a.ZFAVORITE AS is_favorite,
  a.ZHIDDEN AS is_hidden,
  aa.ZTITLE AS title,
  d.ZLONGDESCRIPTION AS description,
  ka.keywords,
  al.albums,
  n.rating,
  n.summary,
  n.notes,
  p.place_name,
  p.region,
  p.country,
  gt.generated_tags,
  st.search_text
FROM ZASSET a
LEFT JOIN ZADDITIONALASSETATTRIBUTES aa
  ON aa.Z_PK = a.ZADDITIONALATTRIBUTES
LEFT JOIN ZASSETDESCRIPTION d
  ON d.Z_PK = aa.ZASSETDESCRIPTION
LEFT JOIN keyword_agg ka
  ON ka.asset_attr_pk = aa.Z_PK
LEFT JOIN album_agg al
  ON al.asset_pk = a.Z_PK
LEFT JOIN enrich.asset_notes n
  ON n.asset_uuid = a.ZUUID
LEFT JOIN enrich.asset_places p
  ON p.asset_uuid = a.ZUUID
LEFT JOIN generated_tags gt
  ON gt.asset_uuid = a.ZUUID
LEFT JOIN enrich.asset_search_text st
  ON st.asset_uuid = a.ZUUID
WHERE a.ZTRASHEDSTATE = 0
ORDER BY a.ZDATECREATED
LIMIT ?;

#!/usr/bin/env python3
"""Load the page's own fact/relation dump into SQLite so every row can be audited.

Reads $AGRILINK_DB_DIR/dump.json (default ~/agrilink-db; produced by test/dump-db.mjs, which
reads the live V03Data/V03Filter objects of the built page) and writes
agrilink.db with audit views.
"""
import json, os, sqlite3, sys, datetime
from pathlib import Path

BASE = Path(os.environ.get('AGRILINK_DB_DIR') or (Path.home() / 'agrilink-db'))
DUMP = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / 'dump.json'
DB = BASE / 'agrilink.db'

dump = json.loads(DUMP.read_text())
facts, objects, relations = dump['facts'], dump['objects'], dump['relations']
meta = dump.get('meta', {})

if DB.exists():
    DB.unlink()
con = sqlite3.connect(DB)
con.executescript("""
CREATE TABLE facts(
  id TEXT PRIMARY KEY, title TEXT, summary TEXT, category TEXT, card_type TEXT,
  date TEXT, ingested_at TEXT, level TEXT,
  province TEXT, city TEXT, county TEXT,
  country_code TEXT, country_name TEXT,
  lng REAL, lat REAL, cred TEXT, impact TEXT, data_mode TEXT,
  source_url TEXT, source_plugin TEXT, data_origin TEXT, dataset TEXT, coordinate_meaning TEXT,
  map_eligible INTEGER, region_path TEXT, evidence TEXT,
  point_key TEXT
);
CREATE TABLE objects(
  id TEXT PRIMARY KEY, name TEXT, domain TEXT, type_name TEXT, sub TEXT,
  lng REAL, lat REAL, country_code TEXT, country_name TEXT,
  source_url TEXT, fact_count INTEGER, degree INTEGER, region_path TEXT
);
CREATE TABLE relations(
  id TEXT PRIMARY KEY, from_id TEXT, to_id TEXT, type TEXT, confidence REAL,
  fact_ids TEXT, from_name TEXT, to_name TEXT
);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
""")

con.executemany("""INSERT INTO facts VALUES(
 :id,:title,:summary,:category,:card_type,:date,:ingested_at,:level,:province,:city,:county,
 :country_code,:country_name,:lng,:lat,:cred,:impact,:data_mode,:source_url,:source_plugin,
 :data_origin,:dataset,:coordinate_meaning,:map_eligible,:region_path,:evidence,:point_key)""",
 [dict(f, point_key=(f'{f["lng"]:.4f}|{f["lat"]:.4f}' if f.get('lng') is not None and f.get('lat') is not None else None)) for f in facts])

names = {f['id']: (f['name'] or '') for f in objects}
con.executemany("INSERT INTO objects VALUES(:id,:name,:domain,:type_name,:sub,:lng,:lat,:country_code,:country_name,:source_url,:fact_count,:degree,:region_path)",
                 [{k: o.get(k) for k in ('id','name','domain','type_name','sub','lng','lat','country_code','country_name','source_url','fact_count','degree','region_path')} for o in objects])
con.executemany("INSERT INTO relations VALUES(:id,:from_id,:to_id,:type,:confidence,:fact_ids,:from_name,:to_name)",
                 [dict(r, from_name=names.get(r['from_id'], ''), to_name=names.get(r['to_id'], '')) for r in relations])

for k, v in list(meta.items()) + [('loaded_at', datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')),
                                  ('source_dump', DUMP.name)]:
    con.execute('INSERT INTO meta VALUES(?,?)', (str(k), json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v))

# 数据里混用了 ISO2（CN/RU）和 ISO3（CHN/RUS）两种国家码 —— 先归一，再统计，
# 否则同一个国家会被拆成两行、覆盖率被误报。原始码保留在 facts.country_code。
ISO2_TO_ISO3 = {
    'CN': 'CHN', 'RU': 'RUS', 'US': 'USA', 'BR': 'BRA', 'IN': 'IND', 'JP': 'JPN', 'KR': 'KOR',
    'TH': 'THA', 'VN': 'VNM', 'MY': 'MYS', 'ID': 'IDN', 'PH': 'PHL', 'AU': 'AUS', 'NZ': 'NZL',
    'CL': 'CHL', 'AR': 'ARG', 'PE': 'PER', 'MX': 'MEX', 'CA': 'CAN', 'DE': 'DEU', 'FR': 'FRA',
    'NL': 'NLD', 'ES': 'ESP', 'IT': 'ITA', 'GB': 'GBR', 'TR': 'TUR', 'EG': 'EGY', 'ZA': 'ZAF',
    'NG': 'NGA', 'KE': 'KEN', 'ET': 'ETH', 'PK': 'PAK', 'BD': 'BGD', 'LK': 'LKA', 'KH': 'KHM',
    'MM': 'MMR', 'LA': 'LAO', 'UA': 'UKR', 'PL': 'POL', 'SE': 'SWE', 'NO': 'NOR', 'DK': 'DNK',
    'FI': 'FIN', 'BE': 'BEL', 'CH': 'CHE', 'AT': 'AUT', 'PT': 'PRT', 'GR': 'GRC', 'IL': 'ISR',
    'SA': 'SAU', 'AE': 'ARE', 'IR': 'IRN', 'IQ': 'IRQ', 'AZ': 'AZE', 'KZ': 'KAZ', 'UZ': 'UZB',
    'MA': 'MAR', 'DZ': 'DZA', 'TN': 'TUN', 'LY': 'LBY', 'SD': 'SDN', 'TZ': 'TZA', 'UG': 'UGA',
    'GH': 'GHA', 'CI': 'CIV', 'SN': 'SEN', 'ML': 'MLI', 'CM': 'CMR', 'ZM': 'ZMB', 'ZW': 'ZWE',
    'MZ': 'MOZ', 'AO': 'AGO', 'MG': 'MDG', 'NP': 'NPL', 'MM2': 'MMR', 'PY': 'PRY', 'UY': 'URY',
    'BO': 'BOL', 'EC': 'ECU', 'CO': 'COL', 'VE': 'VEN', 'GT': 'GTM', 'HN': 'HND', 'SV': 'SLV',
    'NI': 'NIC', 'CR': 'CRI', 'PA': 'PAN', 'DO': 'DOM', 'HT': 'HTI', 'CU': 'CUB', 'JM': 'JAM',
}
ALIAS = {k.lower(): v for k, v in ISO2_TO_ISO3.items()}
def iso3_of(code, name=''):
    c = (code or '').strip()
    if not c:
        return ''
    if len(c) == 3:
        return c.upper()
    return ALIAS.get(c.lower(), c.upper())

con.execute('ALTER TABLE facts ADD COLUMN country_iso3 TEXT')
for code, in con.execute('SELECT DISTINCT country_code FROM facts').fetchall():
    con.execute('UPDATE facts SET country_iso3=? WHERE country_code IS ?', (iso3_of(code), code if code is not None else None))
con.execute('CREATE TABLE country_ref(iso3 TEXT PRIMARY KEY, display_name TEXT)')
for iso3, name in con.execute("SELECT country_iso3, MAX(country_name) FROM facts WHERE country_iso3<>'' GROUP BY 1").fetchall():
    con.execute('INSERT OR REPLACE INTO country_ref VALUES(?,?)', (iso3, name))

con.executescript("""
CREATE INDEX ix_facts_country ON facts(country_code);
CREATE INDEX ix_facts_iso3 ON facts(country_iso3);
CREATE INDEX ix_facts_province ON facts(province);
CREATE INDEX ix_facts_origin ON facts(data_origin);
CREATE INDEX ix_facts_source ON facts(source_url);
CREATE INDEX ix_facts_point ON facts(point_key);
CREATE INDEX ix_objects_domain ON objects(domain);
CREATE INDEX ix_objects_country ON objects(country_code);
CREATE INDEX ix_rel_type ON relations(type);

CREATE VIEW v_facts_by_country AS
SELECT COALESCE(NULLIF(country_code,''),'(无国家标签)') AS country_code,
       COALESCE(NULLIF(country_name,''),'(无)') AS country_name,
       COUNT(*) AS records,
       COUNT(DISTINCT point_key) AS distinct_points,
       SUM(CASE WHEN COALESCE(source_url,'')<>'' THEN 1 ELSE 0 END) AS with_source,
       SUM(map_eligible) AS map_eligible_records,
       MIN(date) AS first_date, MAX(date) AS last_date
FROM facts GROUP BY 1,2;

CREATE VIEW v_facts_by_province AS
SELECT COALESCE(NULLIF(province,''),'(非省级)') AS province, COUNT(*) AS records,
       COUNT(DISTINCT point_key) AS distinct_points,
       SUM(CASE WHEN COALESCE(source_url,'')<>'' THEN 1 ELSE 0 END) AS with_source
FROM facts GROUP BY 1 ORDER BY records DESC;

CREATE VIEW v_facts_by_origin AS
SELECT COALESCE(NULLIF(data_origin,''),'(未标注)') AS data_origin, COUNT(*) AS records,
       SUM(CASE WHEN COALESCE(source_url,'')<>'' THEN 1 ELSE 0 END) AS with_source,
       MIN(source_url) AS example_source
FROM facts GROUP BY 1 ORDER BY records DESC;

CREATE VIEW v_coverage_by_country AS
SELECT f.country_iso3 AS iso3, COALESCE(r.display_name,'(未映射)') AS country,
       COUNT(*) AS records, COUNT(DISTINCT f.point_key) AS distinct_points,
       SUM(CASE WHEN COALESCE(f.source_url,'')<>'' THEN 1 ELSE 0 END) AS with_source,
       SUM(f.map_eligible) AS map_eligible_records, MIN(f.date) AS first_date, MAX(f.date) AS last_date
FROM facts f LEFT JOIN country_ref r ON r.iso3=f.country_iso3
WHERE f.country_iso3 NOT IN ('','CHN') GROUP BY 1,2;

/* 国外覆盖缺口：独立点位 <20 的国家（刘洋要看的清单） */
CREATE VIEW v_thin_countries AS
SELECT * FROM v_coverage_by_country WHERE distinct_points < 20 ORDER BY records DESC;

CREATE VIEW v_unknown_country_codes AS
SELECT country_code, COUNT(*) AS rows FROM facts
WHERE country_iso3 NOT IN ('','CHN') AND country_iso3 NOT IN (SELECT iso3 FROM country_ref) GROUP BY 1;

CREATE VIEW v_missing_source AS
SELECT id, title, country_code, province, data_origin FROM facts
WHERE COALESCE(source_url,'')='' ORDER BY country_code, id;

CREATE VIEW v_duplicate_titles AS
SELECT title, COUNT(*) AS rows, COUNT(DISTINCT country_code) AS countries,
       GROUP_CONCAT(DISTINCT country_code) AS country_list
FROM facts GROUP BY title HAVING COUNT(*) > 1 ORDER BY rows DESC;

CREATE VIEW v_coordinate_reuse AS
SELECT point_key, COUNT(*) AS records, COUNT(DISTINCT id) AS distinct_facts,
       COALESCE(NULLIF(country_name,''),'(无)') AS country_name,
       MIN(source_plugin) AS plugin, MIN(title) AS example_title
FROM facts WHERE point_key IS NOT NULL GROUP BY point_key HAVING records > 30 ORDER BY records DESC;

CREATE VIEW v_fact_sources AS
SELECT source_url, COUNT(*) AS facts, COUNT(DISTINCT country_iso3) AS countries,
       MIN(data_origin) AS data_origin, MIN(title) AS example_title
FROM facts WHERE COALESCE(source_url,'')<>'' GROUP BY 1 ORDER BY facts DESC;

CREATE VIEW v_suspect_rows AS
SELECT '缺少来源链接' AS problem, id, country_iso3, data_origin, title FROM facts WHERE COALESCE(source_url,'')=''
UNION ALL SELECT '缺少坐标', id, country_iso3, data_origin, title FROM facts WHERE lng IS NULL OR lat IS NULL
UNION ALL SELECT '缺少日期', id, country_iso3, data_origin, title FROM facts WHERE COALESCE(date,'')=''
UNION ALL SELECT '标题重复', f.id, f.country_iso3, f.data_origin, f.title FROM facts f
  JOIN (SELECT title FROM facts GROUP BY title HAVING COUNT(*)>1) d ON d.title=f.title;

CREATE VIEW v_localization_precision AS
SELECT COALESCE(NULLIF(coordinate_meaning,''),'(未声明)') AS coordinate_meaning, COUNT(*) AS records
FROM facts GROUP BY 1 ORDER BY records DESC;

CREATE VIEW v_objects_by_country AS
SELECT COALESCE(NULLIF(country_code,''),'(无)') AS country_code,
       COALESCE(NULLIF(country_name,''),'(无)') AS country_name,
       COUNT(*) AS objects, SUM(degree) AS relation_degree,
       SUM(CASE WHEN COALESCE(source_url,'')<>'' THEN 1 ELSE 0 END) AS with_source
FROM objects GROUP BY 1,2 ORDER BY objects DESC;

CREATE VIEW v_relations_by_type AS
SELECT type, COUNT(*) AS relations FROM relations GROUP BY 1 ORDER BY relations DESC;
""")
con.commit()
counts = {t: con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ('facts', 'objects', 'relations')}
thin = con.execute('SELECT COUNT(*) FROM v_thin_countries').fetchone()[0]
no_source = con.execute('SELECT COUNT(*) FROM v_missing_source').fetchone()[0]
dup = con.execute('SELECT COUNT(*) FROM v_duplicate_titles').fetchone()[0]
con.close()
print(json.dumps({**counts, 'thin_countries': thin, 'facts_without_source': no_source, 'duplicate_titles': dup,
                  'db': str(DB), 'bytes': DB.stat().st_size}, ensure_ascii=False, indent=1))

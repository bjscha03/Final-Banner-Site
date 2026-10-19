#!/usr/bin/env python3
"""Refresh public supplier facts. Never imports account prices or credentials.

Run with --cache /tmp/b2-specs to reuse a reviewed capture; omit --cache for live pages.
The output is data, not supplier HTML or executable configurator code.
"""
import argparse, base64, concurrent.futures, datetime, json, re, urllib.parse, urllib.request
from pathlib import Path
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ['standard-retractable', 'deluxe-retractable', 'sd-retractable', 'x-stand',
 'table-top-banner-stand', 'tension-fabric-stand', 'step-repeat-backdrop',
 'feather-angled-flag', 'convex-flag', 'teardrop-flag', 'rectangle-flag', 'econo-feather-flag',
 '4ft-table-cover', '6ft-table-cover', '8ft-table-cover', 'Fitted-Table-Cover', 'stretch-table-cover',
 'event-tent-canopy-graphic', '10x15-event-tent', '10x20-event-tent',
 'clear-acrylic-transparent', 'aluminum-sign', 'aluminum-sandwich-board', 'posters']
def text(node):
    return re.sub(r'\s+', ' ', node.text_content()).strip()
def normalize_urls(value):
    """Clean captured URL whitespace, including reviewed installation records."""
    if isinstance(value, dict):
        return {key: normalize_urls(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_urls(item) for item in value]
    if isinstance(value, str) and re.match(r'^https?://', value.strip()):
        cleaned = value.strip()
        if re.search(r'[\r\n\t\f]', cleaned):
            raise ValueError('Supplier URL contains embedded control characters: '+repr(cleaned))
        return cleaned
    return value
def fetch(slug, cache):
    path = Path(cache)/f'{slug}.json' if cache else None
    if path and path.exists(): data = json.loads(path.read_text())
    else:
        raw = urllib.request.urlopen('https://www.b2sign.com/'+slug, timeout=45).read().decode()
        payload = re.search(r'data-page="([^"]+)"', raw)[1]
        data = json.loads(urllib.parse.unquote(base64.b64decode(payload).decode()))
    item = data['props']['item']
    # Only named, public product fields; no customer/session/config payloads.
    output = dict(id=slug, supplierItemId=item['id'], name=item['title'],
        sourceUrl='https://www.b2sign.com/'+slug, checkedAt=datetime.date.today().isoformat(),
        groups=item['attrs']['attrs'], turnaround=item['attrs'].get('turnaround', []),
        gallery=[dict(url=i['s1000'], thumb=i['s200'], label=f'{item["title"]} — manufacturer view {n+1}')
                 for n,i in enumerate(item.get('images') or [])], specifications=[], downloads=[])
    for section in item['description']:
        doc = html.fromstring('<div>'+section['html']+'</div>')
        tab = section.get('tab', '')
        if tab == 'Spec':
            for node in doc.xpath('.//li | .//tr'):
                value = text(node)
                if value: output['specifications'].append(value)
        for link in doc.xpath('.//a[@href]'):
            url = urllib.parse.urljoin('https://www.b2sign.com', link.get('href'))
            if '/downloadable/' not in url: continue
            row = link.xpath('ancestor::tr')
            cells = row[-1].xpath('./td') if row else []
            context = text(cells[0]) if cells else ''
            headers = row[-1].xpath('ancestor::table[1]//th') if row else []
            cell = link.xpath('ancestor::td[1]')
            index = cells.index(cell[0]) if cell and cell[0] in cells else 0
            header = text(headers[index]) if index < len(headers) else ''
            kind = 'installation' if tab == 'Installation Guide' else 'template'
            label = ' · '.join(dict.fromkeys(x for x in [context, text(link)] if x))
            format = 'PSD' if 'photoshop' in header.lower() else 'AI' if 'illustrator' in header.lower() else 'PDF'
            output['downloads'].append(dict(label=label or item['title'], url=url, kind=kind, format=format))
    # The raw option image records include exact supplier match conditions.
    return slug, output

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--cache'); args=parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        records=dict(pool.map(lambda s: fetch(s,args.cache), SOURCES))
    target=ROOT/'shared/specialty-supplier.json'
    # Preserve reviewed template associations and printable guides. These are
    # curated from the actual PDF artwork and illustrated manufacturer steps.
    previous=json.loads(target.read_text()) if target.exists() else {}
    for slug,record in records.items():
        old=previous.get(slug,{})
        for key in ('installation','installationNotes','videos','templateIds'):
            if key in old: record[key]=old[key]
        record['downloads'].extend(d for d in old.get('downloads',[]) if d.get('localUrl'))
    records = normalize_urls(records)
    target.write_text(json.dumps(records, indent=2, ensure_ascii=False)+'\n')
    print(f'{len(records)} profiles, {sum(len(p["groups"]) for p in records.values())} option groups, '
          f'{sum(len(p["downloads"]) for p in records.values())} downloads, '
          f'{sum(len(p["gallery"]) for p in records.values())} gallery views')

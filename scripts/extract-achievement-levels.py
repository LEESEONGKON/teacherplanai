# -*- coding: utf-8 -*-
"""
NCIC 「2022 개정 교육과정에 따른 성취수준」 PDF에서 성취기준별 성취수준을 추출한다.

표는 3열(성취기준 | 수준 | 성취수준 진술)이고 세로 괘선 좌표로 열을 가른다.
추출한 1열(성취기준 원문)을 앱에 내장된 공식 성취기준과 대조해 검증하므로,
줄바꿈 결합 규칙이 잘못되면 조용히 통과하지 않고 드러난다.

사용법:
    python scripts/extract-achievement-levels.py [middle|high] <과목명> <PDF경로> [<과목명> <PDF경로> ...]

학교급을 생략하면 middle 로 본다. 과목명은 data/curriculum-2022-<학교급>.json 의
과목명과 정확히 같아야 하며, 다르면 비슷한 이름을 알려주고 중단한다.

예:
    python scripts/extract-achievement-levels.py 역사 "C:/.../성취수준(역사).pdf"
    python scripts/extract-achievement-levels.py high 통합사회1 "C:/.../성취수준(통합사회1).pdf"
"""
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

REPO = Path(__file__).resolve().parent.parent
# 역사형 [9역01-01] 과 사회형 [9사(일사)01-01] 을 모두 받는다.
# 사회는 일반사회/지리가 한 과목에 묶여 있어 괄호 구분자가 들어간다.
CODE_RE = re.compile(r'\[\d+[가-힣]+(?:\s*\(\s*[가-힣]+\s*\))?\s*\d{2}\s*-\s*\d{2}\]')
# 수준 칸에는 글자가 하나만 오는 게 보통이지만, 인접 수준이 서술을 공유하면
# 'A/B'처럼 두 글자를 한 칸에 겹쳐 적는 문서가 있다(영어).
LEVEL_CELL_RE = re.compile(r'^[ABCDE\s]+$')

# 성취수준 문서에 실린 코드 오타. 문서를 직접 확인하고 등재한다.
# 성취기준 원문 대조가 함께 돌기 때문에, 잘못 고치면 검증에서 걸린다.
CODE_FIXES = {
    # 초등 접두사 '6국'으로 잘못 적혀 있으나 본문은 [9국05-07]의 성취기준이다.
    ('국어', '[6국05-07]'): '[9국05-07]',
}

# 성취수준 문서의 성취기준 문구가 고시 원문과 크게 다른 사례.
# 추출 오류가 아니라 문서 자체가 다르게 적고 있음을 원문에서 확인한 항목만 등재한다.
# (등재해도 성취수준 진술은 문서 그대로 저장된다)
KNOWN_TEXT_DIFFS = {
    # 문서는 '의복 디자인의 요소를 적용한 개성 있는 옷차림을 통해 …' 로 확장 서술.
    ('기술·가정', '[9기가01-04]'),
    # 문서가 성취기준을 '… 문장을 읽고' 에서 끊어 적었다(고시: '… 읽고 의미와 내용을 파악한다').
    ('생활 독일어', '[9생독03-02]'),
}

# 성취수준 문서에 아예 실리지 않은 성취기준.
# PDF 전체를 검색해 코드가 없음을 확인한 항목만 등재한다. 이 성취기준들은
# 성취수준이 비어 있게 되고, 앱은 채우기에서 해당 항목을 건너뛴다.
KNOWN_MISSING = {
    ('생활 독일어', '[9생독05-04]'),
    ('생활 일본어', '[9생일05-05]'),
    ('생활 베트남어', '[9생베05-05]'),
}


def normalize(text: str) -> str:
    """중점 문자 통일 + 공백 정리. PDF마다 다른 중점을 쓰기 때문에 필요하다."""
    if not text:
        return ''
    for dot in ('\uff65', '\u30fb', '\u2027', '\u22c5', '\u2219', '\u00b7'):
        text = text.replace(dot, '\u00b7')
    text = unicodedata.normalize('NFC', text)
    text = re.sub(r'[ \t\u3000]+', ' ', text)
    return text.strip()


def cluster(values, tol=3):
    merged = []
    for v in sorted(values):
        if not merged or v - merged[-1] > tol:
            merged.append(v)
    return merged


def table_columns(table, page=None):
    """표 자신의 셀 좌표에서 열 경계를 구한다.

    한 페이지에 x 오프셋이 다른 표가 두 개 놓이는 경우가 있어(사회 p30),
    페이지 전체 괘선으로 열을 나누면 경계가 뒤섞인다. 표 단위로 계산해야 한다.

    앞 페이지에서 이어지는 표는 바깥 테두리를 그리지 않고 수준 칸 둘레만
    괘선을 두는 문서가 있다(환경 p35·p36). 그러면 괘선에서 얻는 경계가
    수준 칸의 좌·우 둘뿐이라 성취기준/진술 열을 가를 수 없다. 이때는 같은
    페이지의 온전한 표에서 좌·우 끝을 빌려 네 경계를 완성한다.
    """
    xs = []
    for cell in table.cells:
        if cell:
            xs.extend([round(cell[0], 0), round(cell[2], 0)])
    merged = cluster(xs)
    if len(merged) >= 4:
        return merged

    if page is None or len(merged) != 2:
        return None

    # 가운데 좁은 칸이 정말 수준 칸인지 확인한다. 아니면 손대지 않는다.
    lvl_x0, lvl_x1 = merged
    if not 15 <= lvl_x1 - lvl_x0 <= 45:
        return None
    letters = [w for w in page.extract_words()
               if len(w['text']) == 1 and w['text'] in 'ABCDE'
               and w['x0'] >= lvl_x0 - 1 and w['x1'] <= lvl_x1 + 1
               and w['top'] >= table.bbox[1] - 1 and w['bottom'] <= table.bbox[3] + 1]
    if len(letters) < 2:
        return None

    outer = page_content_bounds(page)
    if not outer or not (outer[0] < lvl_x0 and lvl_x1 < outer[1]):
        return None
    return [outer[0], lvl_x0, lvl_x1, outer[1]]


def page_content_bounds(page):
    """같은 페이지의 온전한 표에서 본문 열의 좌·우 끝을 구한다."""
    xs = []
    for t in page.find_tables():
        cell_xs = [round(c[0], 0) for c in t.cells if c] + [round(c[2], 0) for c in t.cells if c]
        if len(cluster(cell_xs)) >= 4:
            xs.extend([min(cell_xs), max(cell_xs)])
    if not xs:
        return None
    left, right = min(xs), max(xs)
    return (left, right) if right - left > 200 else None


def table_row_bands(table):
    ys = []
    for cell in table.cells:
        if cell:
            ys.extend([round(cell[1], 0), round(cell[3], 0)])
    merged = cluster(ys)
    return [(merged[i], merged[i + 1]) for i in range(len(merged) - 1)]


def column_bands(page, x0, x1, top, bottom):
    """어떤 열의 가로 괘선만 모아 그 열의 칸 경계를 구한다.

    수준이 인접해 서술이 같으면 진술 칸을 병합해 적는 문서가 있다
    (수학: A·B 한 칸, C·D 한 칸, E 한 칸 = 5수준에 진술 3개).
    이때 진술 칸의 경계는 수준 칸의 경계와 다르므로, 열마다 따로 읽어야
    병합된 진술을 해당 수준 모두에 올바로 배분할 수 있다.
    """
    ys = []
    for e in page.horizontal_edges:
        # 이 열을 가로지르는 괘선만 인정한다.
        if e['x0'] <= x0 + 2 and e['x1'] >= x1 - 2 and top - 2 <= e['top'] <= bottom + 2:
            ys.append(round(e['top'], 0))
    merged = cluster(ys)
    return [(merged[i], merged[i + 1]) for i in range(len(merged) - 1)]


def band_containing(bands, y):
    for lo, hi in bands:
        if lo - 1 <= y <= hi + 1:
            return (lo, hi)
    return None


def cell_text(words, x0, x1, top, bottom):
    """열/행 범위 안의 단어를 줄 단위로 묶고 공백으로 잇는다."""
    inside = [w for w in words
              if w['x0'] >= x0 - 1 and w['x1'] <= x1 + 1
              and w['top'] >= top - 1 and w['bottom'] <= bottom + 1]
    if not inside:
        return ''

    # 같은 줄인데 글리프마다 baseline이 미세하게 달라 top 값이 어긋나는 경우가 있다
    # (특히 중점 '･'가 섞인 토큰). 정확한 top으로 묶으면 한 줄이 둘로 쪼개져
    # 단어 순서가 뒤집히므로, 허용오차로 묶는다.
    lines = []
    for w in sorted(inside, key=lambda w: (w['top'], w['x0'])):
        placed = False
        for line in lines:
            if abs(line['top'] - w['top']) <= 3:
                line['words'].append(w)
                placed = True
                break
        if not placed:
            lines.append({'top': w['top'], 'words': [w]})

    out = []
    for line in sorted(lines, key=lambda l: l['top']):
        row = sorted(line['words'], key=lambda w: w['x0'])
        out.append(' '.join(w['text'] for w in row))
    return normalize(' '.join(out))


def extract(pdf_path: Path, subject: str, official_codes):
    """{코드: {'standard': 원문, 'levels': {A..E: 진술}}} 를 문서 순서대로 반환."""
    result = {}
    order = []
    current = None
    last_level = None
    in_section = False

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''

            # 'Ⅲ. 성취수준 > 1. 성취기준별 성취수준' 구간만 처리한다.
            # 앞쪽 '성취수준 개발의 이해' 장에는 다른 학교급 코드([12진로01-03] 등)를
            # 예시로 든 페이지가 있어, 이 과목의 실제 성취기준 코드가 있는 페이지에서만
            # 구간을 연다.
            if not in_section:
                page_codes = {CODE_FIXES.get((subject, re.sub(r'\s+', '', c)), re.sub(r'\s+', '', c))
                              for c in CODE_RE.findall(text)}
                # 예시 페이지는 성취기준을 보통 하나만 인용하므로, 실제 자료 페이지의
                # 기준으로 '이 과목의 성취기준이 둘 이상'을 요구한다.
                if '성취기준별 성취수준' in text and len(page_codes & official_codes) >= 2:
                    in_section = True
                else:
                    continue
            words = page.extract_words(use_text_flow=False, keep_blank_chars=False)

            # '2. 영역별 성취수준' 이 시작되면 종료한다. 다만 마지막 성취기준이
            # 그 제목과 같은 페이지에서 끝나는 문서가 있어(환경 p37), 페이지를
            # 통째로 버리면 그 성취기준의 뒷부분을 잃는다. 제목 위쪽 표까지만
            # 처리하고 종료한다.
            y_limit = None
            if '영역별 성취수준' in text and not CODE_RE.search(text):
                heads = [w['top'] for w in words if '영역별' in w['text']]
                y_limit = min(heads) if heads else 0
                last_page = True
            else:
                last_page = False

            tables = sorted(page.find_tables(), key=lambda t: t.bbox[1])
            if y_limit is not None:
                tables = [t for t in tables if t.bbox[3] <= y_limit]

            for table in tables:
                bounds = table_columns(table, page)
                if not bounds:
                    continue
                std_x = (bounds[0], bounds[1])
                lvl_x = (bounds[1], bounds[2])
                desc_x = (bounds[2], bounds[-1])
                desc_bands = column_bands(page, *desc_x, table.bbox[1], table.bbox[3])

                # 수준 글자가 들어 있는 행만 남긴다.
                leveled = []
                for top, bottom in table_row_bands(table):
                    cell = cell_text(words, *lvl_x, top, bottom)
                    if not cell or not LEVEL_CELL_RE.match(cell):
                        continue
                    letters = [ch for ch in cell if ch in 'ABCDE']
                    if letters:
                        leveled.append((letters, top, bottom))

                # 진술이 페이지를 넘어가면, 이어지는 페이지의 첫 수준 행보다 위에
                # 수준 글자 없는 나머지 문장이 남는다. 그 행은 수준 글자가 없어서
                # 위 목록에 잡히지 않으므로, 여기서 직전 수준에 이어 붙인다.
                if current and last_level:
                    cont_bottom = leveled[0][1] if leveled else table.bbox[3]
                    tail = cell_text(words, *desc_x, table.bbox[1], cont_bottom)
                    tail = tail.replace('성취기준별 성취수준', '').strip()
                    if tail:
                        prev = result[current]['levels'].get(last_level, '')
                        result[current]['levels'][last_level] = normalize(f'{prev} {tail}') if prev else tail

                    # 성취기준 칸도 같은 자리에서 잘리므로 함께 이어 붙인다.
                    std_tail = cell_text(words, *std_x, table.bbox[1], cont_bottom)
                    std_tail = std_tail.replace('성취기준', '').strip()
                    if std_tail and not CODE_RE.search(std_tail):
                        result[current]['standard'] = normalize(
                            f"{result[current]['standard']} {std_tail}"
                        )

                # 'A'가 나올 때마다 새 성취기준 묶음이 시작된다.
                groups = []
                for entry in leveled:
                    if 'A' in entry[0] or not groups:
                        groups.append([entry])
                    else:
                        groups[-1].append(entry)

                for group in groups:
                    g_top = min(t for _, t, _ in group)
                    g_bottom = max(b for _, _, b in group)

                    # 성취기준 셀은 5개 행에 걸쳐 병합되어 있고 세로 가운데 정렬이라,
                    # 묶음 전체 높이로 읽어야 원문이 잘리지 않는다.
                    std_cell = cell_text(words, *std_x, g_top, g_bottom)
                    m = CODE_RE.search(std_cell)
                    if m:
                        # 줄바꿈/자간 때문에 코드 안에 공백이 끼어들 수 있어 제거한다.
                        code = re.sub(r'\s+', '', m.group(0))
                        code = CODE_FIXES.get((subject, code), code)
                        current = code
                        if code not in result:
                            result[code] = {'standard': std_cell, 'levels': {}}
                            order.append(code)
                    elif current and std_cell:
                        # 성취기준 셀이 페이지 경계에서 잘린 경우의 뒷부분.
                        result[current]['standard'] = normalize(
                            f"{result[current]['standard']} {std_cell}"
                        )

                    if not current:
                        continue

                    for letters, top, bottom in group:
                        # 진술 칸은 여러 수준에 걸쳐 병합될 수 있으므로, 수준 행이 아니라
                        # 진술 열 자신의 칸 경계로 읽는다. 병합된 칸은 그 안에 든 수준들이
                        # 같은 진술을 공유한다.
                        band = band_containing(desc_bands, (top + bottom) / 2)
                        desc = cell_text(words, *desc_x, *band) if band else \
                            cell_text(words, *desc_x, top, bottom)
                        if not desc:
                            continue
                        # 한 칸을 공유하는 수준들에는 같은 진술이 들어간다.
                        for level in letters:
                            prev = result[current]['levels'].get(level, '')
                            # 같은 수준이 페이지를 넘어 이어지는 경우를 대비해 이어붙인다.
                            result[current]['levels'][level] = normalize(f'{prev} {desc}') if prev else desc
                            last_level = level

            if last_page:
                break

    return result, order


def load_official(subject: str, level: str):
    """앱에 내장된 공식 성취기준 (검증 기준값)."""
    data = json.loads((REPO / 'data' / f'curriculum-2022-{level}.json').read_text(encoding='utf-8'))
    for s in data['subjects']:
        if s['name'] == subject:
            return {st['c']: normalize(st['t']) for st in s['standards']}
    return {}


def known_subjects(level: str):
    data = json.loads((REPO / 'data' / f'curriculum-2022-{level}.json').read_text(encoding='utf-8'))
    return [s['name'] for s in data['subjects']]


def code_to_subject(level: str):
    """코드 -> 과목명. 한 PDF에 여러 과목이 실린 문서를 가를 때 쓴다."""
    data = json.loads((REPO / 'data' / f'curriculum-2022-{level}.json').read_text(encoding='utf-8'))
    out = {}
    for s in data['subjects']:
        for st in s['standards']:
            out.setdefault(st['c'], s['name'])
    return out


def validate_and_store(subject, extracted, order, official, bundle):
    """한 과목의 추출 결과를 검증하고, 통과한 경우에만 번들에 담는다."""
    print(f'\n=== {subject} ===  추출 {len(order)}개 / 공식 {len(official)}개')

    mismatched, near_miss, missing_levels, unknown, truncated = [], [], [], [], []
    for code in order:
        rec = extracted[code]
        if code not in official:
            unknown.append(code)
            continue
        # 1열 성취기준 원문 대조 = 줄바꿈 결합 규칙 검증.
        # 사회 일부 행은 성취기준 셀 안에 '※ 내용 체계표의 가치·태도 요소를 …' 같은
        # 편집 주석이 함께 들어 있어, 대조 전에 떼어낸다.
        got = re.sub(r'^\[[^\]]+\]\s*', '', rec['standard'])
        # 성취기준 칸에 편집 주석(※ …)이나 탐구 활동 목록이 함께 들어 있는
        # 문서가 있다(사회·과학). 대조 전에 떼어낸다.
        got = normalize(re.split(r'※|<탐구\s*활동>|<실험\s*활동>|•', got)[0])
        want = official[code]
        a, b = got.replace(' ', ''), want.replace(' ', '')
        if a != b:
            # 완전 불일치는 추출 오류, 근소한 차이는 성취수준 문서와 고시 원문의
            # 실제 표현 차이다. 둘을 구분해서 후자는 통과시키되 보고한다.
            ratio = difflib.SequenceMatcher(None, a, b).ratio()
            if (subject, code) in KNOWN_TEXT_DIFFS or ratio >= 0.9:
                near_miss.append((code, want, got, ratio))
            else:
                mismatched.append((code, want, got, ratio))
        if sorted(rec['levels']) not in (['A', 'B', 'C'], ['A', 'B', 'C', 'D', 'E']):
            missing_levels.append((code, sorted(rec['levels'])))

        # 진술은 반드시 완결된 문장으로 끝난다. 페이지 경계에서 뒷부분을 놓치면
        # '… 지속가능한 사회로' 처럼 중간에서 끊기므로, 그 상태로 저장되지 않게 막는다.
        for lv, txt in sorted(rec['levels'].items()):
            if not re.search(r'(다|음|함|임)\s*\.?$', txt.strip()):
                truncated.append((code, lv, txt))

    known_gap = [c for c in official if c not in extracted and (subject, c) in KNOWN_MISSING]
    not_found = [c for c in official if c not in extracted and (subject, c) not in KNOWN_MISSING]

    # 교과에 따라 5단계(A~E)와 3단계(A~C)가 갈린다. 과목 안에서는 한 가지로
    # 통일되어야 하며, 섞여 있으면 표를 잘못 읽은 것이므로 저장하지 않는다.
    shapes = {''.join(sorted(extracted[c]['levels'])) for c in order}
    scale = None
    if len(shapes) == 1:
        shape = next(iter(shapes))
        scale = {'ABCDE': '5', 'ABC': '3'}.get(shape)

    print(f'  성취수준 단계             : {scale + "단계" if scale else f"판별 불가 {sorted(shapes)}"}')
    print(f'  성취기준 원문 대조 불일치 : {len(mismatched)}')
    print(f'  표현 차이(경미, 통과)     : {len(near_miss)}')
    print(f'  수준 누락                : {len(missing_levels)}')
    print(f'  데이터셋에 없는 코드      : {len(unknown)}')
    print(f'  추출되지 않은 성취기준    : {len(not_found)}')
    print(f'  진술 잘림                : {len(truncated)}')
    if known_gap:
        print(f'  문서 미수록(확인됨)       : {len(known_gap)}  {known_gap}')

    for code, want, got, ratio in mismatched[:3]:
        print(f'    [{code}] 유사도 {ratio:.2f}\n      공식: {want[:90]}\n      추출: {got[:90]}')
    for code, want, got, ratio in near_miss:
        print(f'    ~ [{code}] 유사도 {ratio:.3f} — 성취수준 문서의 표현이 고시 원문과 다름')
        print(f'        고시: {want}')
        print(f'        문서: {got}')
    for code, lv in missing_levels[:3]:
        print(f'    [{code}] 수준 {lv}')
    if not_found[:5]:
        print(f'    누락 코드: {not_found[:5]}')

    for code, lv, txt in truncated[:3]:
        print(f'    [{code}] {lv} 진술이 중간에서 끊김: …{txt[-42:]}')

    if mismatched or missing_levels or unknown or not_found or truncated or not scale:
        if not scale:
            print(f'    한 과목 안에 수준 구성이 섞여 있습니다: {sorted(shapes)}')
        print('  => 검증 실패. 이 과목은 저장하지 않습니다.')
        return False

    bundle['subjects'][subject] = {
        'scale': scale,
        'standards': {code: extracted[code]['levels'] for code in order},
    }
    print('  => 검증 통과')
    return True


def main():
    argv = sys.argv[1:]
    level = 'middle'
    if argv and argv[0] in ('middle', 'high'):
        level = argv.pop(0)

    auto = bool(argv) and argv[0] == '--auto'
    if auto:
        argv.pop(0)

    if not argv or (not auto and len(argv) % 2 == 1):
        print(__doc__)
        sys.exit(1)

    out_path = REPO / 'data' / f'achievement-levels-2022-{level}.json'
    bundle = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {}
    bundle.setdefault('source', '')
    bundle.setdefault('subjects', {})

    total_fail = 0

    if auto:
        # 한 PDF에 여러 과목이 실린 문서(생활외국어 8과목 등)를 코드로 갈라 처리한다.
        owner = code_to_subject(level)
        for pdf_path in (Path(a) for a in argv):
            if not pdf_path.exists():
                print(f'!! 파일 없음: {pdf_path}')
                total_fail += 1
                continue

            extracted, order = extract(pdf_path, None, set(owner))

            by_subject = {}
            for code in order:
                subj = owner.get(code)
                if subj:
                    by_subject.setdefault(subj, []).append(code)

            print(f'\n### {pdf_path.name}\n    발견한 과목: {list(by_subject) or "없음"}')
            if not by_subject:
                total_fail += 1
                continue

            for subj, codes in by_subject.items():
                official = load_official(subj, level)
                if not validate_and_store(subj, extracted, codes, official, bundle):
                    total_fail += 1
    else:
        pairs = [(argv[i], Path(argv[i + 1])) for i in range(0, len(argv), 2)]
        for subject, pdf_path in pairs:
            if not pdf_path.exists():
                print(f'!! 파일 없음: {pdf_path}')
                total_fail += 1
                continue

            official = load_official(subject, level)
            if not official:
                names = known_subjects(level)
                close = [n for n in names if subject in n or n in subject][:5]
                print(f'\n=== {subject} ===')
                print(f'!! 교육과정 데이터에 없는 과목명입니다 ({level}).')
                if close:
                    print(f'   혹시 이건가요? {close}')
                print(f'   전체 과목명은 data/curriculum-2022-{level}.json 에 있습니다.')
                total_fail += 1
                continue

            extracted, order = extract(pdf_path, subject, set(official))
            if not validate_and_store(subject, extracted, order, official, bundle):
                total_fail += 1

    bundle['source'] = (
        '교육부·한국교육과정평가원, 「2022 개정 교육과정에 따른 성취수준」 '
        '(국가교육과정정보센터 NCIC 공개). 성취기준별 성취수준 원문.'
    )
    bundle['curriculum'] = '2022'
    bundle['schoolLevel'] = level

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(bundle, ensure_ascii=False), encoding='utf-8')
    size = out_path.stat().st_size / 1024
    print(f'\nwrote {out_path.relative_to(REPO)}  ({size:.0f} KB, 과목 {len(bundle["subjects"])}개)')

    sys.exit(1 if total_fail else 0)


if __name__ == '__main__':
    main()

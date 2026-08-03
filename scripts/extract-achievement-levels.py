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
CODE_RE = re.compile(r'\[9[가-힣]+(?:\s*\(\s*[가-힣]+\s*\))?\s*\d{2}\s*-\s*\d{2}\]')
LEVEL_RE = re.compile(r'^[ABCDE]$')


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


def table_columns(table):
    """표 자신의 셀 좌표에서 열 경계를 구한다.

    한 페이지에 x 오프셋이 다른 표가 두 개 놓이는 경우가 있어(사회 p30),
    페이지 전체 괘선으로 열을 나누면 경계가 뒤섞인다. 표 단위로 계산해야 한다.
    """
    xs = []
    for cell in table.cells:
        if cell:
            xs.extend([round(cell[0], 0), round(cell[2], 0)])
    merged = cluster(xs)
    return merged if len(merged) >= 4 else None


def table_row_bands(table):
    ys = []
    for cell in table.cells:
        if cell:
            ys.extend([round(cell[1], 0), round(cell[3], 0)])
    merged = cluster(ys)
    return [(merged[i], merged[i + 1]) for i in range(len(merged) - 1)]


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


def extract(pdf_path: Path):
    """{코드: {'standard': 원문, 'levels': {A..E: 진술}}} 를 문서 순서대로 반환."""
    result = {}
    order = []
    current = None
    in_section = False

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''

            # 'Ⅲ. 성취수준 > 1. 성취기준별 성취수준' 구간만 처리한다.
            if not in_section:
                if CODE_RE.search(text) and '성취기준별 성취수준' in text:
                    in_section = True
                else:
                    continue
            # '2. 영역별 성취수준' 이 시작되면 종료
            if '영역별 성취수준' in text and not CODE_RE.search(text):
                break

            words = page.extract_words(use_text_flow=False, keep_blank_chars=False)

            tables = sorted(page.find_tables(), key=lambda t: t.bbox[1])
            for table in tables:
                bounds = table_columns(table)
                if not bounds:
                    continue
                std_x = (bounds[0], bounds[1])
                lvl_x = (bounds[1], bounds[2])
                desc_x = (bounds[2], bounds[-1])

                # 수준 글자가 들어 있는 행만 남긴다.
                leveled = []
                for top, bottom in table_row_bands(table):
                    level = cell_text(words, *lvl_x, top, bottom)
                    if LEVEL_RE.match(level):
                        leveled.append((level, top, bottom))

                # 'A'가 나올 때마다 새 성취기준 묶음이 시작된다.
                groups = []
                for entry in leveled:
                    if entry[0] == 'A' or not groups:
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

                    for level, top, bottom in group:
                        desc = cell_text(words, *desc_x, top, bottom)
                        if not desc:
                            continue
                        prev = result[current]['levels'].get(level, '')
                        # 같은 수준이 페이지를 넘어 이어지는 경우를 대비해 이어붙인다.
                        result[current]['levels'][level] = normalize(f'{prev} {desc}') if prev else desc

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


def main():
    argv = sys.argv[1:]
    level = 'middle'
    if argv and argv[0] in ('middle', 'high'):
        level = argv.pop(0)
    if len(argv) < 2 or len(argv) % 2 == 1:
        print(__doc__)
        sys.exit(1)

    pairs = [(argv[i], Path(argv[i + 1])) for i in range(0, len(argv), 2)]
    out_path = REPO / 'data' / f'achievement-levels-2022-{level}.json'
    bundle = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {}
    bundle.setdefault('source', '')
    bundle.setdefault('subjects', {})

    total_fail = 0

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

        extracted, order = extract(pdf_path)
        print(f'\n=== {subject} ===  추출 {len(extracted)}개 / 공식 {len(official)}개')

        mismatched, near_miss, missing_levels, unknown = [], [], [], []
        for code in order:
            rec = extracted[code]
            if code not in official:
                unknown.append(code)
                continue
            # 1열 성취기준 원문 대조 = 줄바꿈 결합 규칙 검증.
            # 사회 일부 행은 성취기준 셀 안에 '※ 내용 체계표의 가치·태도 요소를 …' 같은
            # 편집 주석이 함께 들어 있어, 대조 전에 떼어낸다.
            got = re.sub(r'^\[[^\]]+\]\s*', '', rec['standard'])
            got = normalize(re.split(r'※', got)[0])
            want = official[code]
            a, b = got.replace(' ', ''), want.replace(' ', '')
            if a != b:
                # 완전 불일치는 추출 오류, 근소한 차이는 성취수준 문서와 고시 원문의
                # 실제 표현 차이다. 둘을 구분해서 후자는 통과시키되 보고한다.
                ratio = difflib.SequenceMatcher(None, a, b).ratio()
                (near_miss if ratio >= 0.9 else mismatched).append((code, want, got, ratio))
            if sorted(rec['levels']) not in (['A', 'B', 'C'], ['A', 'B', 'C', 'D', 'E']):
                missing_levels.append((code, sorted(rec['levels'])))

        not_found = [c for c in official if c not in extracted]

        print(f'  성취기준 원문 대조 불일치 : {len(mismatched)}')
        print(f'  표현 차이(경미, 통과)     : {len(near_miss)}')
        print(f'  수준 누락                : {len(missing_levels)}')
        print(f'  데이터셋에 없는 코드      : {len(unknown)}')
        print(f'  추출되지 않은 성취기준    : {len(not_found)}')

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

        if mismatched or missing_levels or unknown or not_found:
            total_fail += 1
            print('  => 검증 실패. 이 과목은 저장하지 않습니다.')
            continue

        bundle['subjects'][subject] = {
            code: extracted[code]['levels'] for code in order
        }
        print('  => 검증 통과')

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

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10LCg3YsPFSwW483qBwn0yFRUTlxmYtfQ

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy

`npm run deploy` builds and publishes `dist/` to the `gh-pages` branch.

## 성취기준 데이터

'2. 성취기준 선택' 탭은 2022 개정 교육과정 성취기준을 앱에 내장된 정적 JSON에서 읽습니다.
API 키나 네트워크 없이 동작하며, 학교급별로 필요할 때만 내려받습니다.

| 파일 | 내용 |
| --- | --- |
| `data/curriculum-2022-middle.json` | 중학교 24과목 · 714개 |
| `data/curriculum-2022-high.json` | 고교 보통교과 155과목 · 2,173개 |

데이터는 [korean-secondary-learning-map-mcp](https://github.com/raphysicst-create/korean-secondary-learning-map-mcp) (MIT)
패키지에서 추출합니다. 교육과정이 개정되지 않는 한 다시 만들 일은 없지만, 필요하면:

```bash
npx -y korean-secondary-learning-map-mcp --help   # 패키지를 npx 캐시에 내려받고
node scripts/build-curriculum-data.mjs            # data/*.json 재생성
```

성취기준 원문은 교육부가 공표한 공공저작물(국가교육과정정보센터 NCIC 공개 [별책3] 중학교 ·
[별책4] 고등학교 교육과정)로, 저작권법 제24조의2에 따라 출처를 표기해 이용합니다.

## 성취수준 데이터

성취수준(A~E)은 위 교육과정 데이터셋에 없어서 별도로 수록합니다.
`data/achievement-levels-2022-middle.json` 에 **성취기준별 성취수준** 원문이 들어 있습니다.

중학교 24개 과목 중 **20개 과목 · 성취기준 629개 · 진술 2,963건**이 수록되어 있습니다.

| 5단계 (A~E) | 3단계 (A~C) |
| --- | --- |
| 과학 87 · 사회 74 · 수학 60 · 기술·가정 52 · 국어 51 · 역사 40 · 도덕 22 · 영어 21 · 생활 외국어 8과목 132 | 체육 51 · 진로와 직업 14 · 미술 13 · 음악 13 |

미수록 4과목:

- **정보 · 환경** — PDF 텍스트 레이어가 손상되어 신뢰할 수 있게 추출되지 않습니다.
  정보는 코드가 `[ 9정02- 04]`처럼 쪼개지고 진술이 중간에서 잘리며, 환경은 일부 페이지의
  표 괘선이 인식되지 않습니다. 검증기가 저장을 거부합니다.
- **보건 · 한문** — 아직 PDF를 넣지 않았습니다.

한 PDF에 여러 과목이 실린 문서(생활 외국어 8과목)는 코드로 갈라 처리합니다:

```bash
python scripts/extract-achievement-levels.py --auto "경로/성취수준(생활외국어).pdf"
```

성취수준 문서가 고시 원문과 다르거나 일부 성취기준을 빠뜨린 사례는 스크립트 상단의
`KNOWN_TEXT_DIFFS` / `KNOWN_MISSING` 에 근거와 함께 등재되어 있습니다.
문서에 없는 성취기준은 성취수준이 비고, 앱은 채우기에서 그 항목을 건너뜁니다.

성취수준 단계는 교과마다 다릅니다. 공통·일반선택 과목은 대체로 5단계(A~E)이고,
예체능 교과와 고교 진로·융합선택 과목은 3단계(A~C)를 씁니다. 추출기가 과목별 단계를
판별해 데이터에 함께 기록하며, 한 과목 안에서 단계가 섞여 있으면 표를 잘못 읽은 것으로
보고 저장하지 않습니다. 앱은 그 단계를 그대로 따르고, 평가 설정이 다르면 확인 후 맞춥니다.

'4. 평가 방법/비율' 탭에서 **[교수학습 계획의 성취기준으로 채우기]** 를 누르면, 계획에 담긴
성취기준들의 성취수준을 수준별로 이어붙여 학기단위 성취수준을 만듭니다. 공식 문서가
'영역별 성취수준'을 구성하는 방식과 같으므로 AI 추론이 개입하지 않습니다.

과목을 추가하려면 NCIC에서 해당 과목 PDF를 받아 실행합니다:

```bash
python scripts/extract-achievement-levels.py 과목명 "경로/성취수준(과목).pdf"
```

추출한 성취기준 원문을 `data/curriculum-2022-middle.json` 의 공식 원문과 대조해
검증하며, 불일치가 있으면 저장하지 않고 중단합니다. `pdfplumber` 가 필요합니다.

수록되지 않은 과목은 같은 탭에서 NCIC 문서(PDF)를 올려 AI로 추출하거나 직접 입력합니다.
한글(HWP)은 브라우저에서 읽을 수 없어 PDF로 저장한 뒤 올려야 합니다.

출처: 교육부·한국교육과정평가원, 「2022 개정 교육과정에 따른 성취수준」(NCIC 공개).

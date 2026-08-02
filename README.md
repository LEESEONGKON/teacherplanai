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

**성취수준(A~E)은 이 데이터셋에 포함되어 있지 않습니다.** '4. 평가 방법/비율' 탭에서
NCIC 「평가기준」 문서(PDF)를 올려 추출하거나 직접 입력해야 합니다.

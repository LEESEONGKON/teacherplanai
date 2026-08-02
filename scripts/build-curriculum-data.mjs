/**
 * 2022 개정 교육과정 성취기준 데이터 생성 스크립트
 *
 * korean-secondary-learning-map-mcp (MIT) 패키지의 데이터 파일에서
 * 성취기준 코드 / 영역 / 공식 원문만 추출해 앱이 쓸 최소 형태로 굽는다.
 *
 * 사용법:
 *   node scripts/build-curriculum-data.mjs [패키지경로]
 *
 * 패키지경로를 생략하면 npx 캐시에서 자동으로 찾는다.
 * 교육과정이 개정되기 전까지 다시 실행할 일은 없다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PKG = 'korean-secondary-learning-map-mcp';

const findPackage = () => {
  const explicit = process.argv[2];
  if (explicit) return explicit;

  const candidates = [];
  const npxCache = path.join(os.homedir(), 'AppData/Local/npm-cache/_npx');
  const linuxCache = path.join(os.homedir(), '.npm/_npx');

  for (const cache of [npxCache, linuxCache]) {
    if (!fs.existsSync(cache)) continue;
    for (const dir of fs.readdirSync(cache)) {
      candidates.push(path.join(cache, dir, 'node_modules', PKG));
    }
  }
  candidates.push(path.join(process.cwd(), 'node_modules', PKG));

  const found = candidates.find(p => fs.existsSync(path.join(p, 'data/kr/curriculum-standards.json')));
  if (!found) {
    console.error(`${PKG} 을(를) 찾지 못했습니다.\n경로를 직접 지정하세요:  node scripts/build-curriculum-data.mjs <경로>`);
    process.exit(1);
  }
  return found;
};

const pkgRoot = findPackage();
const dataDir = path.join(pkgRoot, 'data/kr');
console.log(`source: ${pkgRoot}`);

const readJson = f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
const { curricula } = readJson('curriculum-standards.json');
const textsFile = readJson('standard-texts.json');

const textOf = new Map();
for (const t of textsFile.texts) textOf.set(t.key, t.text);

const SOURCE_NOTE =
  '교육부 공표 공공저작물(국가교육과정정보센터 NCIC 공개 [별책3] 중학교 · [별책4] 고등학교 교육과정 PDF)에서 ' +
  '추출한 2022 개정 교육과정 성취기준 본문. 저작권법 제24조의2에 따라 출처를 표기해 이용합니다. ' +
  `데이터 가공: ${PKG} (MIT).`;

const build = schoolLevel => {
  const subjects = [];
  let missing = 0;

  for (const course of curricula) {
    if (course.schoolLevel !== schoolLevel) continue;
    const standards = [];

    for (const s of course.standards || []) {
      const text = textOf.get(s.key);
      if (!text) { missing++; continue; }
      standards.push({ c: s.code, d: s.domainKorean || '', t: text });
    }
    if (standards.length === 0) continue;

    subjects.push({
      name: course.subjectKorean,
      group: course.subjectGroupKorean,
      category: course.courseCategory,
      standards
    });
  }

  subjects.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { subjects, missing };
};

fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });

for (const level of ['middle', 'high']) {
  const { subjects, missing } = build(level);
  const payload = {
    curriculum: '2022',
    schoolLevel: level,
    source: SOURCE_NOTE,
    generatedFrom: `${PKG}@${JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version}`,
    subjects
  };

  const outFile = path.join(process.cwd(), 'data', `curriculum-2022-${level}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload));

  const count = subjects.reduce((n, s) => n + s.standards.length, 0);
  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`${level.padEnd(7)} ${String(subjects.length).padStart(3)} subjects, ${String(count).padStart(4)} standards -> ${kb} KB${missing ? `  (원문 누락 ${missing}건 제외)` : ''}`);
}

console.log('done.');

/**
 * 2022 개정 교육과정 성취기준 데이터 접근 계층.
 *
 * 데이터는 scripts/build-curriculum-data.mjs 가 생성한 정적 JSON이다.
 * 두 학교급 모두 동적 import 이므로 실제로 조회할 때만 내려받는다
 * (중학교 120KB / 고등학교 402KB, gzip 기준 각각 약 25KB / 79KB).
 */

export type SchoolLevel = 'middle' | 'high';

export interface CurriculumStandard {
  c: string; // 성취기준 코드 (예: "[9수01-01]")
  d: string; // 영역 (예: "수와 연산")
  t: string; // 공식 원문
}

export interface CurriculumSubject {
  name: string;
  group: string;
  category: string;
  standards: CurriculumStandard[];
}

export interface CurriculumData {
  curriculum: string;
  schoolLevel: SchoolLevel;
  source: string;
  generatedFrom: string;
  subjects: CurriculumSubject[];
}

export const SCHOOL_LEVEL_LABEL: Record<SchoolLevel, string> = {
  middle: '중학교',
  high: '고등학교',
};

const cache = new Map<SchoolLevel, CurriculumData>();

export const loadCurriculum = async (level: SchoolLevel): Promise<CurriculumData> => {
  const cached = cache.get(level);
  if (cached) return cached;

  const mod = level === 'middle'
    ? await import('../data/curriculum-2022-middle.json')
    : await import('../data/curriculum-2022-high.json');

  const data = ((mod as any).default ?? mod) as CurriculumData;
  cache.set(level, data);
  return data;
};

/** 성취기준 코드만 뽑아낸다. 교수학습 계획에 이미 담긴 항목을 가려내는 데 쓴다. */
export const extractStandardCode = (text: string): string | null => {
  const m = (text || '').match(/\[[^\]]+\]/);
  return m ? m[0] : null;
};

// --- 성취수준 (A~E) ---
// 성취기준별 성취수준. 교육부·한국교육과정평가원 「2022 개정 교육과정에 따른 성취수준」
// (NCIC 공개)에서 추출했으며, 현재는 일부 과목만 수록되어 있다.

export type LevelKey = 'A' | 'B' | 'C' | 'D' | 'E';
export type StandardLevels = Partial<Record<LevelKey, string>>;

/**
 * 성취수준 단계는 교과마다 다르다. 공통·일반선택 과목은 대체로 5단계(A~E),
 * 예체능 교과와 고교 진로·융합선택 과목은 3단계(A~C)를 쓴다.
 * 따라서 과목마다 실제 단계를 데이터에 함께 담는다.
 */
export type AchievementScale = '3' | '5';

export const LEVEL_KEYS: Record<AchievementScale, LevelKey[]> = {
  '3': ['A', 'B', 'C'],
  '5': ['A', 'B', 'C', 'D', 'E'],
};

export interface SubjectLevels {
  scale: AchievementScale;
  standards: Record<string, StandardLevels>;
}

export interface AchievementLevelData {
  curriculum: string;
  schoolLevel: SchoolLevel;
  source: string;
  subjects: Record<string, SubjectLevels>;
}

let levelCache: AchievementLevelData | null = null;

export const loadAchievementLevels = async (): Promise<AchievementLevelData> => {
  if (levelCache) return levelCache;
  const mod = await import('../data/achievement-levels-2022-middle.json');
  levelCache = ((mod as any).default ?? mod) as AchievementLevelData;
  return levelCache;
};

/** 성취수준이 수록된 과목명 → 공식 단계. UI 안내와 단계 검사에 쓴다. */
export const getLevelSubjectScales = async (): Promise<Record<string, AchievementScale>> => {
  const data = await loadAchievementLevels();
  const out: Record<string, AchievementScale> = {};
  for (const [name, entry] of Object.entries(data.subjects)) out[name] = entry.scale;
  return out;
};

/**
 * 여러 성취기준의 성취수준을 수준별로 이어붙인다.
 *
 * 공식 문서의 '영역별 성취수준'이 그 영역에 속한 성취기준들의 같은 수준 진술을
 * 그대로 이어붙여 만들어져 있어(역사 13개 영역 중 8개에서 A~E 전 수준 완전일치 확인),
 * 학기 범위에 대해서도 같은 방식으로 합치면 공식 서술 방식과 일치한다.
 * 문장을 새로 쓰지 않으므로 AI 추론이 개입하지 않는다.
 */
export const aggregateLevels = (
  levelsByCode: Record<string, StandardLevels>,
  codes: string[],
  keys: LevelKey[]
): Record<LevelKey, string> => {
  const out = { A: '', B: '', C: '', D: '', E: '' } as Record<LevelKey, string>;
  for (const key of keys) {
    const parts: string[] = [];
    for (const code of codes) {
      const text = levelsByCode[code]?.[key];
      if (text) parts.push(text.trim());
    }
    out[key] = parts.join(' ');
  }
  return out;
};

/** 앱의 교수학습 계획 행에 넣을 성취기준 문자열: "[코드] 원문" */
export const formatStandard = (s: CurriculumStandard): string => `${s.c} ${s.t}`;

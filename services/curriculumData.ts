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

/** 앱의 교수학습 계획 행에 넣을 성취기준 문자열: "[코드] 원문" */
export const formatStandard = (s: CurriculumStandard): string => `${s.c} ${s.t}`;

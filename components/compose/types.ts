import { AchievementScale, LevelKey, SchoolLevel } from '../../services/curriculumData';

/** 교수학습-평가 계획 표의 한 행. 한글에 붙여넣을 내용 그대로를 담는다. */
export interface PlanRow {
  code: string;      // 성취기준 코드 (중복 방지·성취수준 연결용)
  unit: string;      // 단원명 = 교육과정 영역
  standard: string;  // [코드] 성취기준 원문
  element: string;   // 평가 요소
  teachingMethod: string;
  notes: string;     // [도입]/[수업]/[평가]
}

export interface RubricCriterionRow {
  id: string;
  criteria: string;  // 상/중/하 서술
  score: string;     // 배점
}

export interface RubricElementRow {
  id: string;
  element: string;   // 채점 요소
  items: RubricCriterionRow[];
}

/** 수행평가 영역별 세부 기준 한 건. */
export interface TaskDraft {
  id: string;
  name: string;              // 수행 과제
  standardCodes: string[];   // 연결된 성취기준 코드
  coreIdea: string;
  criteria: Record<LevelKey, string>;  // 평가 기준 A~E
  methods: string[];         // 평가 방법 체크
  elements: RubricElementRow[];
  totalScore: string;        // 총점 (예: '4점~20점 중 모든 점수')
  baseScore: string;
}

export interface ComposeState {
  schoolLevel: SchoolLevel;
  subject: string;
  rows: PlanRow[];
  levelScale: AchievementScale | null;
  levels: Record<LevelKey, string>;
  tasks: TaskDraft[];
}

export const EMPTY_LEVELS: Record<LevelKey, string> = { A: '', B: '', C: '', D: '', E: '' };

export const INITIAL_COMPOSE: ComposeState = {
  schoolLevel: 'middle',
  subject: '',
  rows: [],
  levelScale: null,
  levels: { ...EMPTY_LEVELS },
  tasks: [],
};

export const EVALUATION_METHODS = [
  '서술·논술', '구술·발표', '토의·토론', '프로젝트',
  '실험·실습', '포트폴리오', '기타',
  '교사 관찰 및 기록', '자기평가', '동료평가',
];

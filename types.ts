export enum GradeLevel {
  GRADE_1 = "1",
  GRADE_2 = "2",
  GRADE_3 = "3"
}

export interface TeachingPlanItem {
  id: string;
  unit: string; // 단원명
  standard: string; // 성취기준
  element: string; // 평가요소
  method: string[]; // 평가방법 (지필/수행/기타)
  teachingMethod: string; // 수업방법 (강의식/모둠 등)
  notes: string; // 수업-평가 연계의 주안점
  remarks?: string; // 비고
  period: string; // 시기 (3월 4주 ~ 4월 2주)
  hours: string; // 시수/누계 (14/14)
}

// New Interface for the Detailed Evaluation Table
export interface EvaluationPlanRow {
  id: string;
  category: '지필평가' | '수행평가'; // Category
  name: string; // 평가 영역 (e.g. 1회고사, 여행 팸플릿 제작)
  maxScore: string; // 영역 만점 (string to allow ranges or empty)
  ratio: number; // 학기말 반영비율 (%)
  
  // Detailed Type Weights (%)
  typeSelect: number; // 선택형/단답형
  typeShort: number; // 서술형
  typeEssay: number; // 논술형
  typeOther: number; // 기타
  
  timing: string; // 평가 시기 (e.g. 4월, 5월)
}

// 1. Single Criterion Row (The detail)
export interface RubricCriterion {
  id: string;
  criteria: string; // 채점 기준
  score: string; // 배점
}

// 2. Element Group (The grouping parent)
export interface RubricElement {
  id: string;
  element: string; // 평가 요소 (제목)
  description?: string; // 평가 요소 설명 (체크리스트 항목 등 상세 내용)
  items: RubricCriterion[]; // Multiple criteria per element
}

export interface PerformanceTask {
  id: string;
  name: string; // 수행평가 과제명 (should ideally match EvaluationPlanRow name)
  
  // Changed: Support multiple standards with full text
  standards: string[]; 
  
  coreIdea?: string; // 2022 개정 교육과정: 핵심 아이디어 (Core Idea)

  description: string; // 핵심 아이디어/내용 -> 평가 요소(Preview에서 사용안함, RubricItem으로 대체 가능하나 하위호환 위해 유지)
  
  // For 2022: A=A, B=B, C=C, D=D, E=E
  // For 2015: A=상(Upper), B=중(Middle), C=하(Lower)
  criteria: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
  method: string[]; // 서술/논술, 구술/발표 등 체크박스

  // New Fields for Detailed Rubric Construction
  rubricType: 'general' | 'checklist'; // 'general' (Attachment 2), 'checklist' (Attachment 3)
  
  // Changed: Nested structure
  rubricElements: RubricElement[];
  
  groupElementName?: string; // Used only for 'checklist' type as the left-side category header
  
  baseScore?: string; // Footer: 기본 점수 및 미인정 처리 기준
}

// Interface for Standards NOT evaluated by Written or Performance Assessments (Optional Section 6)
export interface ExtraEvaluationItem {
  id: string;
  standard: string; // 지필 또는 수행평가로 평가하지 않는 성취기준
  criteria: {
    upper: string; // 상
    middle: string; // 중
    lower: string; // 하
  };
  method: string[]; // 평가 방법
  otherMethodDetail?: string; // 기타 선택 시 상세 내용 (e.g. 모둠 활동평가)
}

export interface PlanData {
  schoolName: string;
  year: number;
  semester: number;
  subject: string;
  grade: GradeLevel;
  curriculumType: '2015' | '2022'; // 2015 Revised (3 levels) vs 2022 Revised (5 levels + Core Idea)
  classRoom: string; // 학급
  hoursPerWeek: number; // 주당시수
  teacherName: string;
  
  // Goals (Page 1 Top) - Optional Section
  includeGoalsSection: boolean; // 교육 목표 및 실천 방안 포함 여부
  gradeGoal: string; // 학년 중점 목표
  humanIdeal: string; // 학년 인간상 (핵심역량)
  teacherGoal: string; // 수업자 수업 중점 목표
  actionPlan: string; // 주요 실천 방안

  // Plan Table (Page 1 Bottom & Page 2)
  teachingPlans: TeachingPlanItem[];

  // Evaluation Config (Page 3)
  evaluationRows: EvaluationPlanRow[];
  achievementScale: '3' | '5'; // 3단계(A,B,C) or 5단계(A,B,C,D,E)
  achievementStandards: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
  evaluationNote: string; // 평가 유의사항
  
  // Rubrics (Page 5)
  performanceTasks: PerformanceTask[];

  // Extra (Page 6 - Optional)
  includeExtraEvaluation?: boolean; // New Flag: 출력물 포함 여부
  extraEvaluationItems: ExtraEvaluationItem[];

  // Section 7 & 8 (Final Remarks)
  absenteePolicy: string; // 7. 평가 미응시자(결시자) 및 학적 변동자 처리
  resultUtilization: string; // 8. 평가 결과의 활용
}
import { GradeLevel, PlanData } from './types';

export const INITIAL_PLAN_DATA: PlanData = {
  schoolName: '',
  year: new Date().getFullYear(),
  semester: 1,
  subject: '',
  grade: GradeLevel.GRADE_2,
  curriculumType: '2022', // Default to 2022 Revised
  classRoom: '',
  hoursPerWeek: 3,
  teacherName: '',
  
  includeGoalsSection: true, // Default enabled
  gradeGoal: '',
  humanIdeal: '',
  teacherGoal: '',
  actionPlan: '',

  teachingPlans: [],

  // Default for Grade 2/3. Grade 1 logic handles clearing written exams in UI.
  // Updated Rule: Sum of types must equal the ratio.
  evaluationRows: [
    {
      id: 'exam-1',
      category: '지필평가',
      name: '1회고사 (중간)',
      maxScore: '100',
      ratio: 30,
      typeSelect: 20, // 20% point
      typeShort: 10,  // 10% point. Total = 30
      typeEssay: 0,
      typeOther: 0,
      timing: '4월'
    },
    {
      id: 'exam-2',
      category: '지필평가',
      name: '2회고사 (기말)',
      maxScore: '100',
      ratio: 30,
      typeSelect: 20,
      typeShort: 10,  // Total = 30
      typeEssay: 0,
      typeOther: 0,
      timing: '7월'
    },
    {
      id: 'perf-1', // Shared ID
      category: '수행평가',
      name: '나만의 수학 용어 사전 만들기',
      maxScore: '100',
      ratio: 40,
      typeSelect: 0,
      typeShort: 0,
      typeEssay: 40, // Total = 40
      typeOther: 0,
      timing: '5월'
    }
  ],

  achievementScale: '5', // Default 5 levels for 2022
  achievementStandards: {
    A: '',
    B: '',
    C: '',
    D: '',
    E: ''
  },
  
  evaluationNote: `1) 교과학습 평가는 학교교육과정의 범위와 수준을 벗어난 내용을 출제하여 평가하지 않는다.
2) 지필평가는 5지 선다형(선택형)과 서·논술형 등 성취기준의 도달 여부를 확인할 수 있는 평가 문항으로 출제하고, 제한된 시간을 충분히 활용할 수 있는 문항 수로 출제한다.
3) 수행평가는 학습의 과정과 결과를 총체적 및 분석적으로 평가하고, 과제 수행을 위한 다양한 방법으로 평가한다.
4) 서·논술형 평가는 학기 단위 합산 점수의 20% 이상이 되도록 하고, 이 중 논술형 평가는 15% 이상이 되도록 한다.
5) 평소 수업 활동이 자연스럽게 평가로 이어지도록 계획하고, 논술형 평가는 사고력, 문제해결력, 창의력 등을 신장시킬 수 있는 평가 문항을 출제하도록 하며 반드시 채점 기준표를 작성한다.
6) 수행평가는 교과별 평가계획 및 평가기준안에 따르고 일제고사 형태의 지필평가와 과제형 평가로 실시하지 않으며, 특정 시기에 집중되거나, 지필평가 준비기간과 겹쳐 학생의 부담이 과중되지 않도록 사전 검토를 충분히 하고 시행한다.
7) 학기말 성적 처리 시 동점자 순위는 학업성적관리규정에 의거한다.
8) 모든 성취기준은 지필 또는 수행평가로 평가하는 것이 원칙이나 지필 또는 수행평가로 평가가 어려운 일부 성취기준은 교사가 학생들의 성취 수준을 확인할 수 있는 기타 적절한 방식으로 평가하고 피드백을 제공하여 학생들의 성장을 지원할 수 있다.`,

  performanceTasks: [
    {
      id: 'perf-1', // Must match the evaluationRow ID above
      name: '나만의 수학 용어 사전 만들기',
      standards: ['[9수01-05] 배운 수학 용어를 정리하고 예시를 들어 설명한다.'],
      coreIdea: '수학적 의사소통을 통해 개념을 명확히 이해하고 표현한다.',
      description: '배운 수학 용어를 정리하고 예시를 들어 설명한다.',
      criteria: {
        A: '모든 용어를 정확하게 정의하고 적절한 예시를 제시함',
        B: '대부분의 용어를 정의하고 예시를 제시함',
        C: '일부 용어의 정의가 미흡하거나 예시가 부족함',
        D: '용어 정의에 오류가 많음',
        E: '과제를 제출하지 않거나 내용이 매우 부족함'
      },
      method: ['서술·논술', '포트폴리오'],
      rubricType: 'checklist',
      rubricElements: [
        {
          id: 'e1',
          element: '용어의 정의',
          description: '- 수학적 용어의 정의가 정확한가?\n- 교과서 내용을 충실히 반영했는가?',
          items: [
            { id: 'c1', criteria: '2가지 항목 모두 충족', score: '50' },
            { id: 'c2', criteria: '1가지 항목 충족', score: '30' }
          ]
        },
        {
          id: 'e2',
          element: '예시 제시',
          description: '- 적절한 예시를 들었는가?\n- 그림이나 도표를 활용했는가?',
          items: [
            { id: 'c3', criteria: '2가지 항목 모두 충족', score: '50' },
            { id: 'c4', criteria: '1가지 항목 충족', score: '30' }
          ]
        }
      ],
      baseScore: '*기본 점수 ○점, 기본 점수를 부여할 수 없는 경우(미인정 결과, 불성실한 수업 참여 등) ○점'
    }
  ],
  
  includeExtraEvaluation: false, // Default false
  extraEvaluationItems: [],

  absenteePolicy: `1) 결석이나 학업중단 숙려제 참가로 인한 수행평가 미응시자의 경우는 개별적으로 별도의 평가기회를 부여하되 고의로 평가를 거부하거나 장기 결석 등으로 평가가 불가능한 경우는 영역별 미응시자 성적 부여 기준에 따라 점수를 부여한다.
2) 전입생의 경우 원적교에서 취득한 점수를 그대로 인정하며 비율이 다른 경우는 본교 기준으로 환산하여 인정함. 원적교에서 수행평가를 치르지 않은 경우에는 본 평가에 준하는 개별 수행평가를 실시함.
3) 1), 2) 항목 외의 기타 사항 발생 시 교과협의회를 거쳐 본교 학업성적관리위원회의 심의 결과에 따라 점수를 부여한다.`,
  
  resultUtilization: `1) 학생의 성취수준 및 역량의 개인차를 고려하여 평가결과를 해석하고 활용한다.
2) 평가 결과는 교수·학습 방법이나 평가 방법, 평가 도구를 개선하기 위한 자료로 활용한다.
3) 평가 결과를 누적하여 학생의 성장과 발달을 파악하거나 학생에게 피드백할 수 있는 근거로 활용한다.
4) 학생, 학부모가 이해하기 쉽도록 [교과명]과가 목표로 하는 세부 능력과 성취 수준을 중심으로 평가 결과를 상세히 제공한다.`
};

export const EVALUATION_METHODS = [
  '서술·논술', '구술·발표', '토의·토론', '프로젝트', 
  '실험·실습', '포트폴리오', '기타', 
  '교사 관찰 및 기록', '자기평가', '동료평가'
];

// New Constant for Section 5 (Extra Evaluation Items)
export const EXTRA_EVALUATION_METHODS = [
  '서술·논술', '구술·발표', '토의·토론', '프로젝트', 
  '실험·실습', '포트폴리오', '기타'
];
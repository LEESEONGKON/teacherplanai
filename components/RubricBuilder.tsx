import React, { useState } from 'react';
import { PlanData, PerformanceTask, ExtraEvaluationItem, RubricElement, RubricCriterion } from '../types';
import { EVALUATION_METHODS, EXTRA_EVALUATION_METHODS } from '../constants';
import { AlertCircle, Plus, Trash2, Sparkles, FolderPlus, Upload, X, Bot, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { generateCriteriaFromRubric, extractRubricsFromFile, generateRubricItems, suggestCoreIdeas, suggestCoreIdeasFromFile } from '../services/geminiService';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
}

const KOREAN_ALPHABET = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

const RubricBuilder: React.FC<Props> = ({ data, onChange }) => {
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Collapse State
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

  const is2022 = data.curriculumType === '2022';
  const use5Levels = data.achievementScale === '5';

  // --- Rubric Generator Modal State ---
  const [genModal, setGenModal] = useState<{
    isOpen: boolean;
    taskId: string;
    elementId: string;
  } | null>(null);
  const [genElementName, setGenElementName] = useState('');
  const [genConsiderations, setGenConsiderations] = useState('');
  const [genItems, setGenItems] = useState<{criteria: string, score: string}[]>([]);
  const [isGeneratingItems, setIsGeneratingItems] = useState(false);

  // --- Core Idea Generator Modal State ---
  const [coreIdeaModal, setCoreIdeaModal] = useState<{ isOpen: boolean; taskId: string } | null>(null);
  const [suggestedIdeas, setSuggestedIdeas] = useState<string[]>([]);
  const [isSuggestingIdeas, setIsSuggestingIdeas] = useState(false);
  const [coreIdeaFile, setCoreIdeaFile] = useState<File | null>(null);

  // --- Helper: Auto-calculate Base Score ---
  const calculateAutoBaseScore = (elements: RubricElement[]): string | null => {
    let totalMin = 0;
    let hasScore = false;

    elements.forEach(el => {
      if (el.items.length === 0) return;
      
      const scores = el.items.map(i => {
        // Extract first number from score string (e.g. "20점" -> 20, "상(10)" -> 10)
        const match = i.score.match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      }).filter(n => !isNaN(n));
      
      if (scores.length > 0) {
        hasScore = true;
        totalMin += Math.min(...scores);
      }
    });

    if (!hasScore) return null;

    const unrecog = totalMin - 1;
    return `*기본 점수 ${totalMin}점, 기본 점수를 부여할 수 없는 경우(미인정 결과, 불성실한 수업 참여 등) ${unrecog}점`;
  };

  // Wrapper to update Rubric Elements AND re-calculate Base Score
  const updateRubricElementsAndScore = (taskId: string, newElements: RubricElement[]) => {
    const autoScore = calculateAutoBaseScore(newElements);
    
    onChange({
      ...data,
      performanceTasks: data.performanceTasks.map(t => 
        t.id === taskId ? {
          ...t,
          rubricElements: newElements,
          // Only update baseScore if calculation was successful (scores exist), otherwise keep existing
          baseScore: autoScore !== null ? autoScore : t.baseScore
        } : t
      )
    });
  };

  const updateTask = (taskId: string, field: keyof PerformanceTask, value: any) => {
    onChange({
      ...data,
      performanceTasks: data.performanceTasks.map(t => 
        t.id === taskId ? { ...t, [field]: value } : t
      )
    });
  };

  const updateCriteria = (taskId: string, grade: keyof PerformanceTask['criteria'], value: string) => {
    onChange({
      ...data,
      performanceTasks: data.performanceTasks.map(t => 
        t.id === taskId ? { ...t, criteria: { ...t.criteria, [grade]: value } } : t
      )
    });
  };

  const toggleMethod = (taskId: string, method: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newMethods = task.method.includes(method)
      ? task.method.filter(m => m !== method)
      : [...task.method, method];
    
    updateTask(taskId, 'method', newMethods);
  };

  const toggleStandard = (taskId: string, std: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;

    const currentStandards = task.standards || [];
    const isAdding = !currentStandards.includes(std);
    
    const newStandards = isAdding
      ? [...currentStandards, std]
      : currentStandards.filter(s => s !== std);

    // 1. Update Performance Tasks with new standards
    const updatedTasks = data.performanceTasks.map(t => 
        t.id === taskId ? { ...t, standards: newStandards } : t
    );

    // 2. Sync with Teaching Plans (Only if adding)
    // When a standard is selected for a Performance Task, automatically check '수행' in Teaching Plan
    let updatedPlans = data.teachingPlans;
    if (isAdding) {
        updatedPlans = data.teachingPlans.map(plan => {
            if (plan.standard === std) {
                // Check '수행' if not already checked
                if (!plan.method.includes('수행')) {
                    return { ...plan, method: [...plan.method, '수행'] };
                }
            }
            return plan;
        });
    }

    onChange({
        ...data,
        performanceTasks: updatedTasks,
        teachingPlans: updatedPlans
    });
  };

  // --- Rubric Element & Criteria Logic ---
  
  const addRubricElement = (taskId: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;

    const newElement: RubricElement = {
      id: Date.now().toString(),
      element: '',
      description: '',
      items: [
        { id: Date.now().toString() + '-c', criteria: '', score: '' }
      ]
    };
    
    const newElements = [...(task.rubricElements || []), newElement];
    updateRubricElementsAndScore(taskId, newElements);
  };

  const removeRubricElement = (taskId: string, elementId: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const newElements = (task.rubricElements || []).filter(e => e.id !== elementId);
    updateRubricElementsAndScore(taskId, newElements);
  };

  const updateRubricElementField = (taskId: string, elementId: string, field: keyof RubricElement, value: any) => {
     const task = data.performanceTasks.find(t => t.id === taskId);
     if (!task) return;
     
     const newElements = (task.rubricElements || []).map(e => 
       e.id === elementId ? { ...e, [field]: value } : e
     );
     updateTask(taskId, 'rubricElements', newElements);
  };

  const addCriterion = (taskId: string, elementId: string) => {
     const task = data.performanceTasks.find(t => t.id === taskId);
     if (!task) return;

     const newCriterion: RubricCriterion = {
       id: Date.now().toString(),
       criteria: '',
       score: ''
     };

     const newElements = (task.rubricElements || []).map(e => 
       e.id === elementId ? { ...e, items: [...e.items, newCriterion] } : e
     );
     updateRubricElementsAndScore(taskId, newElements);
  };

  const removeCriterion = (taskId: string, elementId: string, criterionId: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;

    const newElements = (task.rubricElements || []).map(e => {
      if (e.id === elementId) {
        return { ...e, items: e.items.filter(i => i.id !== criterionId) };
      }
      return e;
    });
    updateRubricElementsAndScore(taskId, newElements);
  };

  const updateCriterion = (taskId: string, elementId: string, criterionId: string, field: keyof RubricCriterion, value: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;

    const newElements = (task.rubricElements || []).map(e => {
      if (e.id === elementId) {
        return {
          ...e,
          items: e.items.map(i => i.id === criterionId ? { ...i, [field]: value } : i)
        };
      }
      return e;
    });

    if (field === 'score') {
        updateRubricElementsAndScore(taskId, newElements);
    } else {
        updateTask(taskId, 'rubricElements', newElements);
    }
  };

  // --- Rubric Generation Logic ---

  const openRubricGenerator = (taskId: string, elementId: string, currentName: string) => {
    setGenModal({ isOpen: true, taskId, elementId });
    setGenElementName(currentName);
    setGenConsiderations('');
    setGenItems([]);
  };

  const handleGenerateRubricItems = async () => {
    if (!genElementName) {
      alert("평가 요소명을 입력해주세요.");
      return;
    }
    setIsGeneratingItems(true);
    setGenItems([]);
    try {
      const items = await generateRubricItems(genElementName, genConsiderations);
      setGenItems(items);
    } catch (e) {
      alert("생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingItems(false);
    }
  };

  const handleApplyRubricItems = () => {
    if (!genModal || genItems.length === 0) return;
    
    const { taskId, elementId } = genModal;
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;

    const newElements = (task.rubricElements || []).map(e => {
      if (e.id === elementId) {
        return {
          ...e,
          // Update the element name if user changed it in modal
          element: genElementName,
          items: genItems.map(item => ({
            id: Date.now().toString() + Math.random(),
            criteria: item.criteria,
            score: item.score
          }))
        };
      }
      return e;
    });

    updateRubricElementsAndScore(taskId, newElements);
    setGenModal(null);
  };

  // --- Core Idea Suggestion Logic ---
  const handleOpenCoreIdeaModal = (taskId: string) => {
    const task = data.performanceTasks.find(t => t.id === taskId);
    if (!task) return;
    if (!task.standards || task.standards.length === 0) {
       alert("핵심 아이디어를 추천받으려면 먼저 위에서 '성취기준'을 하나 이상 선택해주세요.");
       return;
    }
    setSuggestedIdeas([]);
    setCoreIdeaModal({ isOpen: true, taskId });
  };

  const handleSuggestIdeas = async () => {
    if (!coreIdeaModal) return;
    const task = data.performanceTasks.find(t => t.id === coreIdeaModal.taskId);
    if (!task) return;

    setIsSuggestingIdeas(true);
    try {
      let ideas: string[] = [];
      if (coreIdeaFile) {
        ideas = await suggestCoreIdeasFromFile(coreIdeaFile, data.subject, task.standards, task.name);
      } else {
        ideas = await suggestCoreIdeas(data.subject, task.standards, task.name);
      }
      setSuggestedIdeas(ideas);
    } catch(e) {
      alert("추천 중 오류가 발생했습니다.");
    } finally {
      setIsSuggestingIdeas(false);
    }
  };

  const handleSelectCoreIdea = (idea: string) => {
    if (!coreIdeaModal) return;
    updateTask(coreIdeaModal.taskId, 'coreIdea', idea);
    setCoreIdeaModal(null);
  };


  // --- AI Criteria Generation (A/B/C) & File Import ---
  
  const handleGenerateCriteria = async (task: PerformanceTask) => {
    if (!task.rubricElements || task.rubricElements.length === 0) {
      alert("배점 기준표를 먼저 작성해주세요.");
      return;
    }
    const confirmGen = window.confirm(`작성된 배점 기준표를 바탕으로 ${use5Levels ? '5단계(A~E)' : '3단계(상/중/하)'} 평가 기준을 자동으로 생성하시겠습니까?`);
    if (!confirmGen) return;

    setGeneratingTaskId(task.id);
    try {
       const result = await generateCriteriaFromRubric(
         task.name, 
         task.rubricElements, 
         task.rubricType, 
         data.achievementScale
       );
       updateTask(task.id, 'criteria', {
         ...task.criteria,
         ...result
       });
       alert("평가 기준이 생성되었습니다.");
    } catch (e) {
       console.error(e);
       alert("생성 중 오류가 발생했습니다.");
    } finally {
       setGeneratingTaskId(null);
    }
  };

  const handleRubricFileAnalysis = async () => {
    if (!rubricFile) {
        alert("파일을 선택해주세요.");
        return;
    }

    const confirmed = window.confirm(
        "파일에서 수행평가 세부 기준을 추출하여 현재 과제들에 적용하시겠습니까?\n" +
        "- 현재 생성된 수행평가 과제 순서대로 내용이 채워집니다.\n" + 
        "- 과제명(파일 내용), 핵심 아이디어, 성취기준, 평가요소, 배점기준 등이 파일 내용으로 업데이트됩니다."
    );
    if (!confirmed) return;

    setIsExtracting(true);
    try {
        const extractedTasks = await extractRubricsFromFile(rubricFile);
        if (extractedTasks.length === 0) {
            alert("유효한 수행평가 기준을 찾지 못했습니다.");
            return;
        }

        // Get available standards from current teaching plans for normalization
        const availableStandardsList: string[] = Array.from(new Set(
            data.teachingPlans.map(p => p.standard).filter((s): s is string => typeof s === 'string' && !!s)
        ));

        const updatedTasks = data.performanceTasks.map((existingTask, index) => {
            const extracted = extractedTasks[index];
            if (!extracted) return existingTask;

            const autoBaseScore = calculateAutoBaseScore(extracted.rubricElements || []);

            // Normalize standards: try to match extracted standards with existing ones in teaching plans
            let normalizedStandards: string[] = existingTask.standards || [];
            const extractedStandards = extracted.standards; // explicit capture
            if (extractedStandards && extractedStandards.length > 0) {
                normalizedStandards = extractedStandards.map((extStd: string) => {
                    // 1. Exact match check
                    if (availableStandardsList.includes(extStd)) return extStd;
                    
                    // 2. Code match check (e.g. [9수01-01])
                    const codeMatch = extStd.match(/\[[^\]]+\]/);
                    if (codeMatch) {
                        const code = codeMatch[0];
                        const found = availableStandardsList.find((avail: string) => avail.includes(code));
                        if (found) return found;
                    }
                    return extStd;
                });
            }

            return {
                ...existingTask,
                name: extracted.name || existingTask.name, 
                standards: normalizedStandards,
                coreIdea: extracted.coreIdea || existingTask.coreIdea,
                rubricElements: extracted.rubricElements,
                criteria: (extracted.criteria && extracted.criteria.A) ? extracted.criteria : existingTask.criteria,
                method: (extracted.method && extracted.method.length > 0) ? extracted.method : existingTask.method,
                baseScore: autoBaseScore || extracted.baseScore || existingTask.baseScore,
                rubricType: 'checklist',
            };
        });

        // Sync with Teaching Plans: If a standard is used in performance tasks, ensure '수행' is checked
        const allTaskStandards = new Set<string>();
        updatedTasks.forEach(t => t.standards?.forEach(s => allTaskStandards.add(s)));

        const updatedTeachingPlans = data.teachingPlans.map(plan => {
            if (plan.standard && allTaskStandards.has(plan.standard)) {
                 if (!plan.method.includes('수행')) {
                    return { ...plan, method: [...plan.method, '수행'] };
                }
            }
            return plan;
        });

        onChange({ ...data, performanceTasks: updatedTasks, teachingPlans: updatedTeachingPlans });
        alert(`${Math.min(extractedTasks.length, data.performanceTasks.length)}개의 과제 기준을 업데이트했습니다.\n(관련 성취기준의 평가방법 '수행' 체크 완료)`);
        setRubricFile(null);
    } catch (e) {
        console.error(e);
        alert("분석 중 오류가 발생했습니다.");
    } finally {
        setIsExtracting(false);
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm("현재 탭의 수행평가 세부 기준 내용을 초기화하시겠습니까?\n\n(과제 목록은 유지되고 세부 내용(과제명 포함)만 비워지며, 하단의 7, 8번 항목은 유지됩니다)")) {
      const resetTasks = data.performanceTasks.map(t => ({
        ...t,
        name: '', // Added this to clear the task name
        standards: [],
        description: '',
        criteria: { A: '', B: '', C: '', D: '', E: '' },
        method: [],
        rubricElements: [],
        baseScore: '',
        coreIdea: ''
      }));
      
      // Only clear tasks, preserve sections 7 & 8 and new section 5
      onChange({ 
        ...data, 
        performanceTasks: resetTasks
      });
    }
  };

  // --- Extra Evaluation Items Logic ---

  const addExtraItem = () => {
    const newItem: ExtraEvaluationItem = {
      id: Date.now().toString(),
      standard: '',
      criteria: { upper: '', middle: '', lower: '' },
      method: [],
      otherMethodDetail: ''
    };
    onChange({
      ...data,
      extraEvaluationItems: [...(data.extraEvaluationItems || []), newItem]
    });
  };

  const removeExtraItem = (id: string) => {
    onChange({
      ...data,
      extraEvaluationItems: (data.extraEvaluationItems || []).filter(item => item.id !== id)
    });
  };

  const updateExtraItem = (id: string, field: keyof ExtraEvaluationItem, value: any) => {
    onChange({
      ...data,
      extraEvaluationItems: (data.extraEvaluationItems || []).map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    });
  };

  const updateExtraCriteria = (id: string, level: keyof ExtraEvaluationItem['criteria'], value: string) => {
    onChange({
      ...data,
      extraEvaluationItems: (data.extraEvaluationItems || []).map(item =>
        item.id === id ? { ...item, criteria: { ...item.criteria, [level]: value } } : item
      )
    });
  };

  const toggleExtraMethod = (id: string, method: string) => {
    const item = data.extraEvaluationItems?.find(i => i.id === id);
    if (!item) return;

    const newMethods = item.method.includes(method)
      ? item.method.filter(m => m !== method)
      : [...item.method, method];

    updateExtraItem(id, 'method', newMethods);
  };

  // --- Collapse/Expand Logic ---
  const toggleTaskCollapse = (taskId: string) => {
    const newSet = new Set(collapsedTasks);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    setCollapsedTasks(newSet);
  };

  const handleExpandAll = () => setCollapsedTasks(new Set());
  const handleCollapseAll = () => {
    const allIds = data.performanceTasks.map(t => t.id);
    setCollapsedTasks(new Set(allIds));
  };

  const availableStandards: string[] = Array.from(new Set(data.teachingPlans.map(p => p.standard).filter((s): s is string => !!s)));

  // Dynamic numbering start for the final section
  const finalSectionStartNum = data.includeExtraEvaluation ? 7 : 6;

  return (
    <>
      <div className="space-y-6 animate-fade-in relative">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-800 mb-2">5. 수행평가 영역별 세부 기준</h2>
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-md flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                          <p>수행평가 과제 목록(제목)은 <strong>[4. 평가 방법/비율]</strong> 탭에서 입력한 '수행평가 영역'과 연동됩니다.</p>
                          <p className="mt-1 font-bold text-indigo-700">
                             현재 적용된 설정: {is2022 ? '2022 개정 (핵심 아이디어 포함)' : '2015 개정'} / {use5Levels ? '5단계 평가(A~E)' : '3단계 평가(상/중/하)'}
                          </p>
                      </div>
                  </div>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                  {data.performanceTasks.length > 0 && (
                      <div className="flex gap-2">
                        <button 
                            onClick={handleExpandAll}
                            className="flex items-center gap-1 text-xs bg-white text-gray-600 px-3 py-2 rounded hover:bg-gray-50 transition-colors border border-gray-300 font-bold"
                            title="모두 펼치기"
                        >
                            <Maximize2 size={14} /> <span className="hidden sm:inline">모두 펼치기</span>
                        </button>
                        <button 
                            onClick={handleCollapseAll}
                            className="flex items-center gap-1 text-xs bg-white text-gray-600 px-3 py-2 rounded hover:bg-gray-50 transition-colors border border-gray-300 font-bold"
                            title="모두 접기"
                        >
                            <Minimize2 size={14} /> <span className="hidden sm:inline">모두 접기</span>
                        </button>
                        <button 
                            onClick={handleDeleteAll}
                            className="flex-shrink-0 flex items-center gap-1 text-xs bg-red-100 text-red-600 px-3 py-2 rounded hover:bg-red-200 transition-colors border border-red-200 font-bold"
                            title="내용 초기화"
                        >
                            <Trash2 size={14} /> 초기화
                        </button>
                      </div>
                  )}
              </div>
          </div>

          {/* File Import Section */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-md p-4">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex-1 w-full">
                  <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    지난 학기/예시 파일에서 가져오기
                  </h3>
                  <p className="text-xs text-indigo-700 mt-1 mb-3">
                    기존의 수행평가 계획서(이미지, PDF)를 업로드하면 내용을 인식하여 자동으로 채워줍니다.
                  </p>
                </div>
                
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <input 
                      type="file"
                      accept=".pdf, .png, .jpg, .jpeg"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setRubricFile(e.target.files[0]);
                        }
                      }}
                      className="block w-full text-xs text-gray-500
                        file:mr-2 file:py-1.5 file:px-3
                        file:rounded-md file:border-0
                        file:text-xs file:font-semibold
                        file:bg-white file:text-indigo-700
                        hover:file:bg-indigo-50
                        border border-indigo-200 rounded
                      "
                    />
                  <button 
                    onClick={handleRubricFileAnalysis}
                    disabled={!rubricFile || isExtracting}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold text-white shadow-sm transition-colors flex items-center gap-1 w-full justify-center ${
                      !rubricFile 
                      ? 'bg-gray-300 cursor-not-allowed' 
                      : isExtracting
                        ? 'bg-indigo-400 cursor-wait'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {isExtracting ? '분석 중...' : <><Upload size={12} /> 가져오기</>}
                  </button>
                </div>
              </div>
            </div>
        </div>

        {data.performanceTasks.length === 0 && (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-500">
              등록된 수행평가 과제가 없습니다.<br/>
              <strong>[4. 평가 방법/비율]</strong> 탭에서 수행평가 영역을 추가해주세요.
          </div>
        )}

        {data.performanceTasks.map((task, index) => {
          const headerLabel = KOREAN_ALPHABET[index] || (index + 1).toString();
          const linkedEvalRow = data.evaluationRows.find(r => r.id === task.id);
          const headerName = linkedEvalRow ? linkedEvalRow.name : task.name;
          const isCollapsed = collapsedTasks.has(task.id);
          
          return (
            <div key={task.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6 transition-all duration-200">
              <div 
                className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => toggleTaskCollapse(task.id)}
              >
                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                    {headerLabel}. {headerName}
                    {isCollapsed && (
                        <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 border rounded-full shadow-sm">
                            내용 펼치기
                        </span>
                    )}
                </h3>
                <button className="text-gray-500 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-200">
                    {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                </button>
              </div>
              
              {!isCollapsed && (
              <div className="p-6 space-y-6 animate-fade-in">
                {/* Row 1: Name */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">수행 과제명</label>
                    <input
                      type="text"
                      value={task.name}
                      onChange={(e) => updateTask(task.id, 'name', e.target.value)}
                      className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                      placeholder="수행 과제명 입력 (예: 스포츠 트레이닝 영상제작, 팝스)"
                    />
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      * 위 과제명은 표 내부 '수행 과제' 란에 출력됩니다. (3번 탭의 영역명과 다를 수 있습니다)
                    </p>
                </div>

                {/* Row 2: Standards Selection */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">성취기준 선택 (다중 선택 가능)</label>
                    {availableStandards.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2 bg-gray-50">
                        {availableStandards.map((std, idx) => (
                          <label key={idx} className="flex items-start gap-2 text-sm p-1 hover:bg-white rounded cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={(task.standards || []).includes(std)}
                              onChange={() => toggleStandard(task.id, std)}
                              className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-gray-700">{std}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-red-500">
                        * [3. 교수학습 계획] 탭에 입력된 성취기준이 없습니다. 먼저 입력해주세요.
                      </p>
                    )}
                    {(task.standards || []).length > 0 && (
                      <div className="mt-2 text-xs text-indigo-600">
                          선택됨: {task.standards.join(', ')}
                      </div>
                    )}
                </div>

                {/* Row 2.5: Core Idea (Only for 2022 Curriculum) */}
                {is2022 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-sm font-bold text-indigo-700">핵심 아이디어 (2022 개정)</label>
                      <button 
                        onClick={() => handleOpenCoreIdeaModal(task.id)}
                        className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1 transition-colors"
                        title="선택된 성취기준을 바탕으로 핵심 아이디어 추천"
                      >
                         <Sparkles size={12} /> AI 추천 도우미
                      </button>
                    </div>
                    <input
                      type="text"
                      value={task.coreIdea || ''}
                      onChange={(e) => updateTask(task.id, 'coreIdea', e.target.value)}
                      className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500 bg-indigo-50"
                      placeholder="예: 자연환경과 인간 생활의 유기적 관계를 고려하는..."
                    />
                  </div>
                )}

                {/* Row 3: Evaluation Methods */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">평가 방법 (다중 선택)</label>
                  <div className="flex flex-wrap gap-2">
                    {EVALUATION_METHODS.map(method => (
                      <button
                        key={method}
                        onClick={() => toggleMethod(task.id, method)}
                        className={`px-3 py-1 rounded-full text-sm border ${
                          task.method.includes(method)
                            ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-200" />

                {/* Row 4: Rubric Detail Editor (Unified Checklist Style) */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-gray-700">평가 요소 및 채점 기준 (배점표)</label>
                  </div>

                  <div className="space-y-4">
                      {(task.rubricElements || []).map((element, index) => (
                        <div key={element.id} className="border border-gray-300 rounded-lg p-4 bg-gray-50 relative">
                          {/* Element Name Input */}
                          <div className="mb-2 pr-8">
                              <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-2">
                                평가 요소명 (제목)
                                <button
                                  onClick={() => openRubricGenerator(task.id, element.id, element.element)}
                                  className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1 transition-colors"
                                  title="AI 채점 기준 생성기 열기"
                                >
                                  <Bot size={12} /> AI 채점 기준 생성
                                </button>
                              </label>
                              <input 
                                type="text"
                                value={element.element}
                                onChange={(e) => updateRubricElementField(task.id, element.id, 'element', e.target.value)}
                                placeholder="평가 요소 입력 (예: 스포츠 트레이닝 영상 제작 개인)"
                                className="w-full text-sm border-gray-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500"
                              />
                          </div>

                          {/* Description / Checklist Items Input */}
                          <div className="mb-3 pr-8">
                              <label className="block text-xs font-bold text-gray-500 mb-1">세부 항목 (설명/체크리스트) - *내용이 있으면 평가요소 우측에 별도 칸으로 출력됩니다</label>
                              <textarea 
                                value={element.description || ''}
                                onChange={(e) => updateRubricElementField(task.id, element.id, 'description', e.target.value)}
                                placeholder="- 동작의 순서&#13;&#10;- 동작의 정확성&#13;&#10;- 모둠 내 역할 수행 정도"
                                className="w-full text-sm border-gray-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500 h-24"
                              />
                          </div>

                          {/* Delete Element Button */}
                          <button 
                              onClick={() => removeRubricElement(task.id, element.id)} 
                              className="absolute top-4 right-4 text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                              title="평가 요소 삭제"
                          >
                              <Trash2 size={16} />
                          </button>

                          {/* Criteria Table */}
                          <div className="bg-white border border-gray-200 rounded overflow-hidden">
                              <table className="min-w-full text-sm divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium text-gray-600">채점 기준</th>
                                      <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">배점</th>
                                      <th className="px-2 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {element.items.map(item => (
                                      <tr key={item.id}>
                                          <td className="p-2 align-top">
                                            <textarea
                                                value={item.criteria}
                                                onChange={(e) => updateCriterion(task.id, element.id, item.id, 'criteria', e.target.value)}
                                                className="w-full border-gray-200 rounded p-1 text-sm resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                                rows={2}
                                                placeholder="채점 기준 내용 (예: 5개 항목 만족)"
                                            />
                                          </td>
                                          <td className="p-2 align-top">
                                            <input
                                                type="text"
                                                value={item.score}
                                                onChange={(e) => updateCriterion(task.id, element.id, item.id, 'score', e.target.value)}
                                                className="w-full border-gray-200 rounded p-1 text-sm text-center focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="점수"
                                            />
                                          </td>
                                          <td className="p-2 text-center align-middle">
                                            <button 
                                                onClick={() => removeCriterion(task.id, element.id, item.id)}
                                                className="text-gray-400 hover:text-red-500"
                                                title="기준 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                          </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                          </div>
                          
                          <div className="mt-2 text-right">
                              <button 
                                onClick={() => addCriterion(task.id, element.id)}
                                className="text-xs inline-flex items-center gap-1 text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded"
                              >
                                <Plus size={12} /> 채점 기준 추가
                              </button>
                          </div>
                        </div>
                      ))}

                      <button 
                          onClick={() => addRubricElement(task.id)}
                          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 text-sm font-medium"
                      >
                          <FolderPlus size={16} /> 평가 요소 추가
                      </button>
                    </div>
                </div>

                {/* Row 5: Criteria (A/B/C/D/E or Upper/Middle/Lower) - AI Generation Available */}
                <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-bold text-gray-700">평가 기준 (성취기준별 성취수준)</label>
                      <button
                        onClick={() => handleGenerateCriteria(task)}
                        disabled={generatingTaskId === task.id}
                        className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 shadow-sm transition-all disabled:bg-gray-300"
                      >
                        <Sparkles size={12} />
                        {generatingTaskId === task.id ? '생성 중...' : `위 내용을 바탕으로 ${use5Levels ? '5단계' : '3단계'} 자동 생성`}
                      </button>
                  </div>
                  
                  {use5Levels ? (
                      // 5 Levels (A, B, C, D, E)
                      <div className="space-y-2">
                        {(['A', 'B', 'C', 'D', 'E'] as const).map((grade) => (
                            <div key={grade} className="flex gap-2 items-start">
                            <div className="w-8 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-sm">
                                {grade}
                            </div>
                            <textarea
                                value={task.criteria[grade]}
                                onChange={(e) => updateCriteria(task.id, grade, e.target.value)}
                                className="w-full border-gray-300 rounded p-1.5 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder={`${grade}등급 평가 기준`}
                            />
                            </div>
                        ))}
                      </div>
                  ) : (
                      // 3 Levels (Upper, Middle, Lower) -> Mapped to A, B, C keys
                      <div className="space-y-2">
                          <div className="flex gap-2 items-start">
                             <div className="w-12 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-sm">상</div>
                             <textarea
                                value={task.criteria.A}
                                onChange={(e) => updateCriteria(task.id, 'A', e.target.value)}
                                className="w-full border-gray-300 rounded p-1.5 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="상 수준 평가 기준"
                             />
                          </div>
                          <div className="flex gap-2 items-start">
                             <div className="w-12 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-sm">중</div>
                             <textarea
                                value={task.criteria.B}
                                onChange={(e) => updateCriteria(task.id, 'B', e.target.value)}
                                className="w-full border-gray-300 rounded p-1.5 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="중 수준 평가 기준"
                             />
                          </div>
                          <div className="flex gap-2 items-start">
                             <div className="w-12 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-sm">하</div>
                             <textarea
                                value={task.criteria.C}
                                onChange={(e) => updateCriteria(task.id, 'C', e.target.value)}
                                className="w-full border-gray-300 rounded p-1.5 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="하 수준 평가 기준"
                             />
                          </div>
                      </div>
                  )}
                </div>

                {/* Row 6: Base Score */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">기본 점수 및 처리 기준</label>
                  <input
                    type="text"
                    value={task.baseScore || ''}
                    onChange={(e) => updateTask(task.id, 'baseScore', e.target.value)}
                    className="w-full text-xs border-gray-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="예: *기본 점수 0점, 미인정 결과 0점 등"
                  />
                </div>

              </div>
              )}
            </div>
          );
        })}

        {/* --- EXTRA EVALUATION SECTION (Section 6) --- */}
        <div className="border-t-4 border-gray-200 pt-8 mt-12 mb-12">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    6. 지필/수행평가로 평가하지 않는 성취기준
                    <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">선택사항</span>
                </h2>
                <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-2 rounded-full hover:bg-gray-200 transition-colors">
                    <input 
                        type="checkbox"
                        checked={data.includeExtraEvaluation || false}
                        onChange={(e) => onChange({...data, includeExtraEvaluation: e.target.checked})}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-bold text-indigo-700">출력물에 포함하기</span>
                </label>
            </div>

            {data.includeExtraEvaluation && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-blue-50 p-4 rounded-md border border-blue-200 mb-2">
                        <p className="text-sm text-blue-800">
                            지필평가나 수행평가로 평가하기 어려운 성취기준(예: 태도, 정의적 영역 등)에 대한 평가 계획을 수립합니다.
                            출력 시 표 형태로 정리되어 나타납니다.
                        </p>
                    </div>

                    {data.extraEvaluationItems.map((item, idx) => (
                        <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm relative">
                            <div className="absolute top-4 right-4">
                                <button 
                                    onClick={() => removeExtraItem(item.id)}
                                    className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                                    title="항목 삭제"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">평가 항목 #{idx + 1}</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left: Standard & Methods */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">성취기준</label>
                                        <textarea 
                                            value={item.standard}
                                            onChange={(e) => updateExtraItem(item.id, 'standard', e.target.value)}
                                            className="w-full border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 h-24 resize-none"
                                            placeholder="[9수01-01] 성취기준 내용..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">평가 방법</label>
                                        <div className="flex flex-wrap gap-2">
                                            {EXTRA_EVALUATION_METHODS.map(method => (
                                                <label key={method} className="flex items-center gap-1 cursor-pointer">
                                                    <input 
                                                        type="checkbox"
                                                        checked={item.method.includes(method)}
                                                        onChange={() => toggleExtraMethod(item.id, method)}
                                                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm text-gray-700">{method}</span>
                                                    {method === '기타' && item.method.includes('기타') && (
                                                      <input 
                                                        type="text"
                                                        value={item.otherMethodDetail || ''}
                                                        onChange={(e) => updateExtraItem(item.id, 'otherMethodDetail', e.target.value)}
                                                        placeholder="내용 입력"
                                                        className="border-b border-gray-400 focus:outline-none focus:border-indigo-500 text-xs ml-1 w-24 p-0.5"
                                                        onClick={(e) => e.stopPropagation()}
                                                      />
                                                    )}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Criteria Levels */}
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                                    <h4 className="font-bold text-sm text-gray-700 mb-2">평가 기준 (상/중/하)</h4>
                                    <div className="flex gap-2 items-start">
                                        <div className="w-8 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-xs">상</div>
                                        <textarea 
                                            value={item.criteria.upper}
                                            onChange={(e) => updateExtraCriteria(item.id, 'upper', e.target.value)}
                                            className="w-full border-gray-300 rounded p-2 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="상 수준 기준"
                                        />
                                    </div>
                                    <div className="flex gap-2 items-start">
                                        <div className="w-8 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-xs">중</div>
                                        <textarea 
                                            value={item.criteria.middle}
                                            onChange={(e) => updateExtraCriteria(item.id, 'middle', e.target.value)}
                                            className="w-full border-gray-300 rounded p-2 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="중 수준 기준"
                                        />
                                    </div>
                                    <div className="flex gap-2 items-start">
                                        <div className="w-8 shrink-0 h-8 flex items-center justify-center bg-white border border-gray-300 rounded font-bold text-gray-600 text-xs">하</div>
                                        <textarea 
                                            value={item.criteria.lower}
                                            onChange={(e) => updateExtraCriteria(item.id, 'lower', e.target.value)}
                                            className="w-full border-gray-300 rounded p-2 text-xs h-16 resize-none focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="하 수준 기준"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <button 
                        onClick={addExtraItem}
                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex justify-center items-center gap-2 text-sm font-medium"
                    >
                        <Plus size={16} /> 항목 추가하기
                    </button>
                </div>
            )}
        </div>

        {/* --- EXTRA EVALUATION SECTION --- */}
        <div className="border-t-4 border-gray-200 pt-8 mt-12">
          {/* Removed previous <h2> title for 7 & 8 */}
          
          <div className="space-y-6">
            <div>
              <label className="block text-xl font-bold text-gray-800 mb-2">{finalSectionStartNum}. 평가 미응시자(결시자) 및 학적 변동자 처리</label>
              <textarea
                value={data.absenteePolicy}
                onChange={(e) => onChange({...data, absenteePolicy: e.target.value})}
                rows={5}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-3 border text-sm leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xl font-bold text-gray-800 mb-2">{finalSectionStartNum + 1}. 평가 결과의 활용</label>
              <div className="bg-indigo-50 border border-indigo-100 p-2 mb-2 rounded text-xs text-indigo-700">
                * 텍스트 내에 <strong>[교과명]</strong> 이라고 입력하면, 미리보기/출력 시 
                기본 정보 탭에서 입력한 과목명(예: {data.subject || '수학'})으로 자동 변환됩니다.
              </div>
              <textarea
                value={data.resultUtilization}
                onChange={(e) => onChange({...data, resultUtilization: e.target.value})}
                rows={6}
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-3 border text-sm leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* --- MODAL: Rubric Generator --- */}
      {genModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="p-4 border-b flex justify-between items-center bg-indigo-50 rounded-t-lg">
                <h3 className="font-bold text-lg text-indigo-800 flex items-center gap-2">
                   <Bot size={20} /> AI 채점 기준 생성기
                </h3>
                <button 
                  onClick={() => setGenModal(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4">
                 <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 border border-blue-100">
                    평가 요소명과 선생님의 요구사항(단계, 배점 등)을 입력하면<br/>
                    AI가 구체적인 채점 기준과 점수를 제안해줍니다.
                 </div>

                 <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">평가 요소명</label>
                    <input 
                      type="text"
                      value={genElementName}
                      onChange={(e) => setGenElementName(e.target.value)}
                      className="w-full border-gray-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="예: 보고서 작성 내용"
                    />
                 </div>

                 <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">채점 기준 제작 시 고려사항</label>
                    <textarea 
                      value={genConsiderations}
                      onChange={(e) => setGenConsiderations(e.target.value)}
                      className="w-full border-gray-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500 h-24"
                      placeholder="예: 3단계로 나누어주고 점수는 20점, 15점, 10점으로 해줘. 내용의 정확성과 창의성을 중점적으로 평가해줘."
                    />
                 </div>

                 <button
                    onClick={handleGenerateRubricItems}
                    disabled={isGeneratingItems || !genElementName}
                    className={`w-full py-2 rounded-md font-bold text-white shadow-sm transition-colors flex justify-center items-center gap-2 ${
                      isGeneratingItems || !genElementName
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                 >
                    {isGeneratingItems ? '생성 중...' : '생성하기'}
                 </button>

                 {/* Generation Result */}
                 {genItems.length > 0 && (
                    <div className="mt-4 animate-fade-in">
                       <h4 className="font-bold text-sm text-gray-800 mb-2">생성 결과 미리보기</h4>
                       <div className="border border-gray-200 rounded overflow-hidden">
                          <table className="min-w-full text-sm divide-y divide-gray-200">
                             <thead className="bg-gray-50">
                                <tr>
                                   <th className="px-3 py-2 text-left font-medium text-gray-600">기준</th>
                                   <th className="px-3 py-2 text-center font-medium text-gray-600 w-16">배점</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-200 bg-white">
                                {genItems.map((item, idx) => (
                                   <tr key={idx}>
                                      <td className="p-2 text-gray-800 text-xs">{item.criteria}</td>
                                      <td className="p-2 text-center font-bold text-xs">{item.score}</td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                       <button
                          onClick={handleApplyRubricItems}
                          className="w-full mt-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-bold shadow-sm transition-colors"
                       >
                          위 내용으로 반영하기
                       </button>
                       <p className="text-xs text-gray-500 mt-2 text-center">
                          * 반영하기를 누르면 기존에 입력된 이 요소의 채점 기준이 덮어씌워집니다.
                       </p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* --- MODAL: Core Idea Generator --- */}
      {coreIdeaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="p-4 border-b flex justify-between items-center bg-indigo-50 rounded-t-lg">
                <h3 className="font-bold text-lg text-indigo-800 flex items-center gap-2">
                   <Sparkles size={20} /> 핵심 아이디어 AI 추천 도우미
                </h3>
                <button 
                  onClick={() => setCoreIdeaModal(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                 {/* File Upload Section in Modal */}
                 <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-bold text-gray-700 mb-2">핵심 아이디어 문서 파일 (선택)</label>
                    <p className="text-xs text-gray-600 mb-3">
                       교과서나 교육과정 문서의 '핵심 아이디어' 부분이 포함된 이미지나 PDF 파일을 업로드하면, 해당 내용을 기반으로 추천해줍니다.
                    </p>
                    <input 
                      type="file" 
                      accept=".pdf, .png, .jpg, .jpeg"
                      onChange={(e) => {
                         if (e.target.files && e.target.files[0]) {
                            setCoreIdeaFile(e.target.files[0]);
                         }
                      }}
                      className="block w-full text-xs text-gray-500
                        file:mr-2 file:py-1.5 file:px-3
                        file:rounded-md file:border-0
                        file:text-xs file:font-semibold
                        file:bg-white file:text-indigo-700
                        hover:file:bg-indigo-50
                        border border-gray-300 rounded bg-white
                      "
                    />
                    {coreIdeaFile && (
                       <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle size={12} className="w-3 h-3" /> 파일 선택됨: {coreIdeaFile.name}
                       </p>
                    )}
                 </div>
                 
                 <div className="flex justify-center mb-6">
                    <button
                       onClick={handleSuggestIdeas}
                       disabled={isSuggestingIdeas}
                       className={`w-full py-2 rounded-md font-bold text-white shadow-sm transition-colors flex justify-center items-center gap-2 ${
                         isSuggestingIdeas
                           ? 'bg-gray-400 cursor-not-allowed'
                           : 'bg-indigo-600 hover:bg-indigo-700'
                       }`}
                    >
                       {isSuggestingIdeas ? '분석 및 생성 중...' : (
                          coreIdeaFile ? '파일 내용 기반 추천받기' : 'AI 자동 추천받기 (파일 없이)'
                       )}
                    </button>
                 </div>

                 {isSuggestingIdeas ? (
                    <div className="text-center py-4">
                       <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                       <p className="text-gray-600">
                         {coreIdeaFile ? '파일 내용을 분석하고 있습니다...' : '성취기준을 분석하여 추천 중입니다...'}
                       </p>
                    </div>
                 ) : suggestedIdeas.length > 0 ? (
                    <div className="space-y-3">
                       <p className="text-sm font-bold text-gray-700 mb-2">추천 결과 (선택 시 자동 입력)</p>
                       {suggestedIdeas.map((idea, idx) => (
                          <button
                             key={idx}
                             onClick={() => handleSelectCoreIdea(idea)}
                             className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-sm text-gray-800 leading-relaxed group"
                          >
                             <span className="group-hover:text-indigo-700">{idea}</span>
                          </button>
                       ))}
                    </div>
                 ) : (
                    !isSuggestingIdeas && (
                        <p className="text-center text-gray-400 text-sm py-4">
                           위 버튼을 눌러 핵심 아이디어를 추천받으세요.
                        </p>
                    )
                 )}
              </div>
           </div>
        </div>
      )}
    </>
  );
};

// Helper for check icon
const CheckCircle = ({size, className}: {size?: number, className?: string}) => (
   <svg 
     xmlns="http://www.w3.org/2000/svg" 
     width={size || 24} 
     height={size || 24} 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="currentColor" 
     strokeWidth="2" 
     strokeLinecap="round" 
     strokeLinejoin="round" 
     className={className}
   >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
   </svg>
);

export default RubricBuilder;
import React, { useState } from 'react';
import { PlanData, GradeLevel } from '../types';
import { BookOpen, School, Upload, Sparkles, AlertCircle } from 'lucide-react';
import { extractGradeGoalsFromFile, generateTeacherGoals } from '../services/geminiService';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
}

const BasicInfo: React.FC<Props> = ({ data, onChange }) => {
  const [goalFile, setGoalFile] = useState<File | null>(null);
  const [isAnalyzingGoals, setIsAnalyzingGoals] = useState(false);
  const [isGeneratingTeacherGoals, setIsGeneratingTeacherGoals] = useState(false);

  const handleChange = (field: keyof PlanData, value: any) => {
     onChange({ ...data, [field]: value });
  };

  const handleGoalFileAnalysis = async () => {
    if (!goalFile) {
      alert("학년 교육과정 파일을 선택해주세요.");
      return;
    }

    setIsAnalyzingGoals(true);
    try {
      const result = await extractGradeGoalsFromFile(goalFile);
      onChange({
        ...data,
        gradeGoal: result.gradeGoal || data.gradeGoal,
        humanIdeal: result.humanIdeal || data.humanIdeal
      });
      alert("파일에서 내용을 추출하여 적용했습니다.");
      setGoalFile(null);
    } catch (e) {
      console.error(e);
      alert("파일 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzingGoals(false);
    }
  };

  const handleGenerateGoals = async () => {
    if (!data.subject) {
      alert("과목명을 먼저 입력해주세요.");
      return;
    }
    if (!data.gradeGoal && !data.humanIdeal) {
      alert("AI 생성을 위해 '학년 중점 목표' 또는 '학년 인간상'을 먼저 입력하거나 파일로 불러와주세요.");
      return;
    }

    const confirmGen = window.confirm(`입력된 학년 목표와 인간상을 바탕으로\n[${data.subject}] 교과의 '수업 목표'와 '실천 방안'을 생성하시겠습니까?`);
    if (!confirmGen) return;

    setIsGeneratingTeacherGoals(true);
    try {
      const result = await generateTeacherGoals(data.subject, data.grade, data.gradeGoal, data.humanIdeal);
      onChange({
        ...data,
        teacherGoal: result.teacherGoal || data.teacherGoal,
        actionPlan: result.actionPlan || data.actionPlan
      });
    } catch (e) {
      console.error(e);
      alert("생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingTeacherGoals(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <School className="w-5 h-5 text-indigo-600" />
            기본 정보 (Basic Info)
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">학년도</label>
            <input
              type="number"
              value={data.year}
              onChange={(e) => handleChange('year', Number(e.target.value))}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="예: 2025"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">학교명</label>
            <input
              type="text"
              value={data.schoolName}
              onChange={(e) => handleChange('schoolName', e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="예: 서울중학교"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">과목 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={data.subject}
              onChange={(e) => handleChange('subject', e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="예: 수학, 국어"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">학년 / 학기</label>
            <div className="flex gap-2">
              <select
                value={data.grade}
                onChange={(e) => handleChange('grade', e.target.value)}
                className="w-1/2 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              >
                <option value={GradeLevel.GRADE_1}>1학년</option>
                <option value={GradeLevel.GRADE_2}>2학년</option>
                <option value={GradeLevel.GRADE_3}>3학년</option>
              </select>
              <select
                value={data.semester}
                onChange={(e) => handleChange('semester', Number(e.target.value))}
                className="w-1/2 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              >
                <option value={1}>1학기</option>
                <option value={2}>2학기</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">학급</label>
            <input
              type="text"
              value={data.classRoom}
              onChange={(e) => handleChange('classRoom', e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="예: 1반~6반"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">주당 시수</label>
            <input
              type="number"
              value={data.hoursPerWeek}
              onChange={(e) => handleChange('hoursPerWeek', Number(e.target.value))}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="예: 3"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">지도교사</label>
            <input
              type="text"
              value={data.teacherName}
              onChange={(e) => handleChange('teacherName', e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
              placeholder="성함 입력"
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <div className="flex items-center gap-3">
             <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                교육 목표 및 실천 방안
             </h2>
             <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors">
                <input
                    type="checkbox"
                    checked={data.includeGoalsSection !== false} // Default true if undefined
                    onChange={(e) => handleChange('includeGoalsSection', e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-sm text-gray-700 font-medium">출력 포함</span>
             </label>
          </div>
          
          {data.includeGoalsSection !== false && (
              <button
                onClick={handleGenerateGoals}
                disabled={isGeneratingTeacherGoals}
                className={`px-4 py-2 rounded-md text-xs font-bold text-white shadow-sm transition-colors flex items-center gap-1 ${
                  isGeneratingTeacherGoals 
                    ? 'bg-indigo-400 cursor-wait'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isGeneratingTeacherGoals ? '생성 중...' : <><Sparkles size={14} /> 교과 목표 및 실천방안 AI 생성</>}
              </button>
          )}
        </div>

        {data.includeGoalsSection !== false ? (
          <>
            {/* Goal Extraction Section */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-md p-4 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    학년 교육과정 파일 분석
                  </h3>
                  <p className="text-xs text-indigo-700 mt-1">
                    학교에서 배부된 <strong>학년 교육과정 운영 계획(PDF, hwp 등)</strong> 파일을 업로드하면, 
                    아래 '학년 중점 목표'와 '학년 인간상'을 자동으로 추출하여 입력합니다.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input 
                      type="file"
                      accept=".pdf, .txt, .hwp"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setGoalFile(e.target.files[0]);
                        }
                      }}
                      className="block w-full text-xs text-gray-500
                        file:mr-2 file:py-1.5 file:px-3
                        file:rounded-md file:border-0
                        file:text-xs file:font-semibold
                        file:bg-white file:text-indigo-700
                        hover:file:bg-indigo-50
                      "
                    />
                  <button 
                    onClick={handleGoalFileAnalysis}
                    disabled={!goalFile || isAnalyzingGoals}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold text-white shadow-sm transition-colors flex items-center gap-1 ${
                      !goalFile 
                      ? 'bg-gray-300 cursor-not-allowed' 
                      : isAnalyzingGoals
                        ? 'bg-indigo-400 cursor-wait'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {isAnalyzingGoals ? '분석 중...' : <><Upload size={12} /> 추출 및 적용</>}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {data.grade}학년 중점 목표
                </label>
                <textarea
                  value={data.gradeGoal}
                  onChange={(e) => handleChange('gradeGoal', e.target.value)}
                  rows={2}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border bg-gray-50"
                  placeholder="파일을 업로드하면 자동으로 채워집니다. 직접 수정도 가능합니다."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {data.grade}학년 인간상 (핵심 역량)
                </label>
                <textarea
                  value={data.humanIdeal}
                  onChange={(e) => handleChange('humanIdeal', e.target.value)}
                  rows={2}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border bg-gray-50"
                  placeholder="예: 창의적 사고 역량, 의사소통 역량 (파일 업로드 시 자동 입력)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {data.year}년 수업자 수업 중점 목표
                </label>
                <textarea
                  value={data.teacherGoal}
                  onChange={(e) => handleChange('teacherGoal', e.target.value)}
                  rows={2}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
                  placeholder="상단 '교과 목표 및 실천방안 AI 생성' 버튼을 누르면 자동 생성됩니다."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  주요 실천 방안
                </label>
                <textarea
                  value={data.actionPlan}
                  onChange={(e) => handleChange('actionPlan', e.target.value)}
                  rows={3}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 border"
                  placeholder="상단 '교과 목표 및 실천방안 AI 생성' 버튼을 누르면 자동 생성됩니다."
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-gray-500 text-sm italic p-8 bg-gray-50 rounded text-center border border-dashed border-gray-300">
              이 항목은 출력물에 포함되지 않습니다. (학교 자체 양식 미사용 시 체크 해제)
          </div>
        )}
      </div>
    </div>
  );
};

export default BasicInfo;
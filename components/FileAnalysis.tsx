import React, { useState } from 'react';
import { PlanData } from '../types';
import { Upload, Sparkles, FileText, CheckCircle, Settings, Play, ArrowDownCircle, BookOpen } from 'lucide-react';
import { parseStandardsAndGeneratePlan, generateSemesterStandardsFromDomainFile } from '../services/geminiService';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
}

const FileAnalysis: React.FC<Props> = ({ data, onChange }) => {
  // Single Shared File State
  const [file, setFile] = useState<File | null>(null);

  // Range & Filter Inputs
  const [planRange, setPlanRange] = useState(''); // Plan - Content Scope
  const [planPageRange, setPlanPageRange] = useState(''); // Plan - PDF Page Scope

  const [stdRange, setStdRange] = useState(''); // Standard - Content Scope
  const [stdPageRange, setStdPageRange] = useState(''); // Standard - PDF Page Scope
  
  // Unified Loading State
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleCurriculumChange = (value: '2015' | '2022') => {
    onChange({
        ...data,
        curriculumType: value,
    });
  };

  const handleUnifiedAnalysis = async () => {
    if (!file) {
      alert("먼저 상단에서 파일을 업로드해주세요.");
      return;
    }
    if (!data.subject) {
      alert("기본 정보 탭에서 과목명을 먼저 입력해주세요. (분석에 필요)");
      return;
    }

    const confirmAnalysis = window.confirm(
      "파일을 분석하여 다음 작업을 수행합니다:\n\n" +
      "1. 교수학습 계획: 설정된 '성취기준 페이지'를 분석하여 추가\n" +
      "2. 학기단위 성취수준: 설정된 '성취수준 페이지'를 분석하여 덮어쓰기\n" +
      "   (성취수준 페이지 미입력 시, 성취기준 페이지 내용을 바탕으로 자동 생성)\n\n" +
      "진행하시겠습니까?"
    );
    if (!confirmAnalysis) return;

    setIsAnalyzing(true);

    // 1. Plan Task
    const planPromise = parseStandardsAndGeneratePlan(file, data.subject, data.grade, planRange, planPageRange)
        .catch(err => {
            console.error("Plan Analysis Error:", err);
            return null; 
        });
        
    // 2. Semester Standards Task
    // Fallback: If stdPageRange is empty, use planPageRange. The API prompt now handles synthesis if table is missing.
    const effectiveStdPageRange = stdPageRange.trim() ? stdPageRange : planPageRange;
    
    const stdPromise = generateSemesterStandardsFromDomainFile(
        file, 
        data.achievementScale, 
        data.subject, 
        stdRange, 
        effectiveStdPageRange
    ).catch(err => {
        console.error("Standard Analysis Error:", err);
        return null;
    });

    try {
      const [newPlans, stdResult] = await Promise.all([planPromise, stdPromise]);

      let message = "✅ 분석 및 적용이 완료되었습니다.\n----------------------------------\n";
      const newData = { ...data };
      
      // 1. Apply Plans
      if (newPlans && newPlans.length > 0) {
          newData.teachingPlans = [...newData.teachingPlans, ...newPlans];
          message += `📄 [교수학습 계획]: ${newPlans.length}개의 성취기준이 추가되었습니다.\n`;
      } else {
          message += `📄 [교수학습 계획]: 추가된 항목이 없습니다. (성취기준 페이지 범위를 확인하세요)\n`;
      }

      // 2. Apply Standards
      if (stdResult && (stdResult.A || stdResult.B || stdResult.C)) {
          const newStandards = { ...newData.achievementStandards };
          if (stdResult.A) newStandards.A = stdResult.A;
          if (stdResult.B) newStandards.B = stdResult.B;
          if (stdResult.C) newStandards.C = stdResult.C;
          if (data.achievementScale === '5') {
            if (stdResult.D) newStandards.D = stdResult.D || '';
            if (stdResult.E) newStandards.E = stdResult.E || '';
          }
          newData.achievementStandards = newStandards;
          message += `📊 [성취수준]: 학기단위 성취수준이 업데이트되었습니다.\n`;
          if (!stdPageRange.trim()) {
             message += `   (성취수준 페이지 미지정으로 인해 성취기준 내용을 바탕으로 생성됨)\n`;
          }
      } else {
          message += `📊 [성취수준]: 변경된 내용이 없습니다.\n`;
      }

      onChange(newData);
      alert(message);

    } catch (e) {
      console.error(e);
      alert("분석 중 치명적인 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            2. 파일 분석 및 자동 생성
        </h2>
        <p className="text-gray-600 text-sm mb-6">
            <strong>교육과정 문서(성취기준, 성취수준)</strong>가 포함된 파일을 업로드하세요.<br/>
            페이지 범위를 각각 지정하면 AI가 해당 부분만 읽어 정확하게 분석합니다.
        </p>

        {/* 0. Curriculum Selection Section */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" /> 적용 교육과정 (필수 확인)
            </h3>
            <div className="flex flex-col sm:flex-row gap-4">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border cursor-pointer transition-all ${data.curriculumType === '2022' ? 'bg-white border-blue-500 text-blue-700 font-bold shadow-sm ring-1 ring-blue-500' : 'bg-blue-50/50 border-blue-200 text-gray-600 hover:bg-white'}`}>
                    <input 
                      type="radio" 
                      name="curriculum" 
                      value="2022"
                      checked={data.curriculumType === '2022'}
                      onChange={() => handleCurriculumChange('2022')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span>2022 개정 (핵심 아이디어 포함)</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border cursor-pointer transition-all ${data.curriculumType === '2015' ? 'bg-white border-blue-500 text-blue-700 font-bold shadow-sm ring-1 ring-blue-500' : 'bg-blue-50/50 border-blue-200 text-gray-600 hover:bg-white'}`}>
                    <input 
                      type="radio" 
                      name="curriculum" 
                      value="2015"
                      checked={data.curriculumType === '2015'}
                      onChange={() => handleCurriculumChange('2015')}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span>2015 개정</span>
                </label>
            </div>
            <div className="text-xs text-blue-600 mt-2 space-y-1">
                <p>* <strong>2022 개정</strong>: 수행평가 작성 시 '핵심 아이디어' 입력란이 활성화됩니다.</p>
                <p>* <strong>평가 단계(3단계/5단계)</strong>는 '4. 평가 방법/비율' 탭에서 자유롭게 설정할 수 있습니다.</p>
            </div>
        </div>

        {/* 1. Shared File Upload Section */}
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 mb-8 text-center hover:border-indigo-400 transition-colors">
            <div className="flex flex-col items-center justify-center gap-2">
                <Upload className="w-10 h-10 text-gray-400" />
                <label className="block text-sm font-bold text-gray-700">분석할 파일 선택 (PDF 권장)</label>
                <input 
                    type="file" 
                    accept=".pdf, .txt, .jpg, .png"
                    onChange={(e) => {
                        if(e.target.files) setFile(e.target.files[0]);
                    }}
                    className="block w-full max-w-md text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-indigo-600 file:text-white
                    hover:file:bg-indigo-700
                    cursor-pointer mx-auto
                    "
                />
                <p className="text-xs text-gray-500 mt-2">
                   {file ? `선택된 파일: ${file.name}` : '성취기준 및 성취수준 내용이 담긴 파일을 업로드해주세요.'}
                </p>
            </div>
        </div>
        
        {/* 2. Settings Grid (Ranges) */}
        <div className="grid md:grid-cols-2 gap-6 relative mb-8">
            {/* Disabled Overlay if no file */}
            {!file && (
                <div className="absolute inset-0 bg-white bg-opacity-60 z-10 flex items-center justify-center backdrop-blur-[1px] rounded-lg border border-gray-100">
                    <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-gray-200 text-sm font-bold text-gray-500 flex items-center gap-2">
                        <Upload size={16} /> 먼저 파일을 업로드해주세요
                    </div>
                </div>
            )}

            {/* Card 1: Teaching Plan Range */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-5 shadow-sm flex flex-col h-full">
                <div className="mb-4 pb-2 border-b border-indigo-200">
                    <h3 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                        <FileText size={20} />
                        1. 성취기준 문서 분석
                    </h3>
                    <p className="text-xs text-indigo-700 mt-1">
                        <strong>[교수학습 계획]</strong> 탭에 추가될 내용을 추출합니다.
                    </p>
                </div>
                
                <div className="space-y-4 flex-1">
                    <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1 flex items-center gap-1">
                            <BookOpen size={14} /> PDF 페이지 범위 (필수)
                        </label>
                        <input 
                            type="text"
                            value={planPageRange}
                            onChange={(e) => setPlanPageRange(e.target.value)}
                            placeholder="예: 5-10"
                            className="w-full text-sm border-indigo-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            * <strong>성취기준([9수01-01] 등)</strong>이 표로 정리된 페이지를 입력하세요.<br/>
                            * 이 페이지만 읽어서 분석하므로 섞일 염려가 없습니다.
                        </p>
                    </div>

                    <div className="pt-2 border-t border-indigo-100">
                        <label className="block text-sm font-bold text-gray-700 mb-1">내용 범위 필터 (선택)</label>
                        <input 
                            type="text"
                            value={planRange}
                            onChange={(e) => setPlanRange(e.target.value)}
                            placeholder="예: [9수01-01] ~ [9수01-05]"
                            className="w-full text-sm border-gray-300 rounded p-2 border focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">특정 단원만 추출하고 싶을 때 입력하세요.</p>
                    </div>
                </div>
            </div>

            {/* Card 2: Standards Range */}
            <div className="bg-green-50 border border-green-100 rounded-lg p-5 shadow-sm flex flex-col h-full">
                <div className="mb-4 pb-2 border-b border-green-200">
                     <h3 className="font-bold text-lg text-green-900 flex items-center gap-2">
                        <ArrowDownCircle size={20} />
                        2. 학기단위 성취수준 분석
                    </h3>
                    <p className="text-xs text-green-700 mt-1">
                         <strong>[학기단위 성취수준]</strong> 탭에 덮어쓸 내용을 생성합니다.
                    </p>
                </div>

                <div className="space-y-4 flex-1">
                    <div>
                        <label className="block text-sm font-bold text-gray-800 mb-1 flex items-center gap-1">
                             <BookOpen size={14} /> PDF 페이지 범위 <span className="text-indigo-600">(선택)</span>
                        </label>
                        <input 
                            type="text"
                            value={stdPageRange}
                            onChange={(e) => setStdPageRange(e.target.value)}
                            placeholder="예: 11-13 (비워두면 왼쪽 페이지 내용으로 생성)"
                            className="w-full text-sm border-green-300 rounded p-2 border focus:ring-green-500 focus:border-green-500 bg-white shadow-sm"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            * <strong>입력 시:</strong> 지정된 페이지의 학기/영역별 성취수준 표를 추출합니다.<br/>
                            * <strong>미입력 시:</strong> 1번에서 입력한 성취기준 페이지의 내용을 바탕으로 AI가 성취수준을 자동 생성(종합)합니다.
                        </p>
                    </div>

                    <div className="pt-2 border-t border-green-100">
                        <label className="block text-sm font-bold text-gray-700 mb-1">내용 범위 필터 (선택)</label>
                        <input 
                            type="text"
                            value={stdRange}
                            onChange={(e) => setStdRange(e.target.value)}
                            placeholder="예: I단원 ~ III단원"
                            className="w-full text-sm border-gray-300 rounded p-2 border focus:ring-green-500 focus:border-green-500 bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">특정 단원 내용만 반영하고 싶을 때 입력하세요.</p>
                    </div>
                </div>
            </div>
        </div>

        {/* 3. Unified Action Button */}
        <div className="relative">
             {!file && <div className="absolute inset-0 bg-white/60 z-10 rounded-lg"></div>}
             <button
                onClick={handleUnifiedAnalysis}
                disabled={!file || isAnalyzing}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex justify-center items-center gap-3 text-lg ${
                    isAnalyzing
                    ? 'bg-gray-400 cursor-wait'
                    : 'bg-gradient-to-r from-indigo-600 to-green-600 hover:from-indigo-700 hover:to-green-700 transform hover:scale-[1.01]'
                }`}
            >
                {isAnalyzing ? (
                    <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        분석 및 생성 중...
                    </>
                ) : (
                    <>
                        <Play fill="currentColor" size={20} />
                        설정된 범위로 분석 및 생성 시작
                    </>
                )}
            </button>
            <p className="text-center text-xs text-gray-500 mt-3 flex justify-center items-center gap-1">
                <CheckCircle size={14} /> 1번(교수학습)과 2번(성취수준) 작업을 동시에 수행합니다.
            </p>
        </div>

        {/* Status Indicators */}
        {(data.teachingPlans.length > 1 || data.achievementStandards.A) && (
            <div className="mt-6 flex justify-center gap-4 text-xs font-medium text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className={`flex items-center gap-1 ${data.teachingPlans.length > 1 ? 'text-indigo-600' : ''}`}>
                    <CheckCircle size={14} /> 교수학습 계획: {data.teachingPlans.length}개 작성됨
                </div>
                <div className="w-px h-4 bg-gray-300"></div>
                <div className={`flex items-center gap-1 ${data.achievementStandards.A ? 'text-green-600' : ''}`}>
                    <CheckCircle size={14} /> 성취수준: {data.achievementStandards.A ? '입력됨' : '미입력'}
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default FileAnalysis;
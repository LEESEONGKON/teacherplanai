import React, { useState, useRef, useEffect } from 'react';
import { PlanData } from './types';
import { INITIAL_PLAN_DATA } from './constants';
import { generateSamplePlan } from './services/geminiService';
import BasicInfo from './components/BasicInfo';
import TeachingPlan from './components/TeachingPlan';
import EvaluationConfig from './components/EvaluationConfig';
import RubricBuilder from './components/RubricBuilder';
import Preview from './components/Preview';
import FileAnalysis from './components/FileAnalysis';
import { Layout, FileText, PieChart, CheckSquare, Printer, Save, FolderOpen, Settings, Key, X, Sparkles, HelpCircle, ZoomIn, ZoomOut, Maximize, Scissors, FileInput, Copy } from 'lucide-react';

// Tabs with responsive labels (full label for title, short for UI)
// Updated Order: Basic -> Analysis -> Plan -> Weights -> Rubrics -> Preview
const TABS = [
  { id: 'basic', label: '1. 기본 정보', shortLabel: '1. 기본 정보', icon: Layout },
  { id: 'analysis', label: '2. 파일 분석', shortLabel: '2. 파일 분석', icon: Sparkles },
  { id: 'plan', label: '3. 교수학습 계획', shortLabel: '3. 교수학습', icon: FileText },
  { id: 'weights', label: '4. 평가 방법/비율', shortLabel: '4. 평가 비율', icon: PieChart },
  { id: 'rubrics', label: '5. 수행평가 기준', shortLabel: '5. 채점 기준', icon: CheckSquare },
  { id: 'preview', label: '6. 미리보기', shortLabel: '6. 미리보기', icon: FileText }, // Icon changed to FileText to distinguish from Print action
] as const;

type TabId = typeof TABS[number]['id'];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [data, setData] = useState<PlanData>(INITIAL_PLAN_DATA);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Print Mode State
  const [isPrintMode, setIsPrintMode] = useState(false);
  
  // Margin State (Lifted Up to persist across tabs)
  const [printMargins, setPrintMargins] = useState({ top: 10, right: 10, bottom: 10, left: 10 });
  const [showMarginsInPreview, setShowMarginsInPreview] = useState(true);
  const [showPageBreaks, setShowPageBreaks] = useState(true); // Visual Guide
  const [enablePageBreakControl, setEnablePageBreakControl] = useState(false); // Manual Page Break Control
  const [oneRubricPerPage, setOneRubricPerPage] = useState(false); // Auto Rubric Page Break

  // Print Scale State (Zoom/Fit)
  const [printScale, setPrintScale] = useState(1.0);

  // API Key State
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    // Check for API key on mount
    const storedKey = localStorage.getItem('TEACHER_PLAN_API_KEY');
    if (storedKey) {
      setApiKeyInput(storedKey);
    } else {
      // If no key found, prompt user once
      // setTimeout(() => setShowApiKeyModal(true), 1000);
    }
  }, []);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('TEACHER_PLAN_API_KEY', apiKeyInput.trim());
      setShowApiKeyModal(false);
      alert("API 키가 저장되었습니다.");
    } else {
      // Allow clearing the key
      if (window.confirm("API 키를 삭제하시겠습니까? 삭제 후에는 AI 기능을 사용할 수 없습니다.")) {
        localStorage.removeItem('TEACHER_PLAN_API_KEY');
        setApiKeyInput('');
        setShowApiKeyModal(false);
      }
    }
  };

  const handleAutoFill = async () => {
    if (!data.subject) {
      alert("AI 생성을 시작하려면 '과목'명을 반드시 입력해주세요.\n(입력된 과목을 기반으로 내용을 생성합니다)");
      return;
    }
    
    let message = `[${data.subject}] 과목에 대한 예시 데이터를 AI로 생성하시겠습니까?\n기존 입력된 일부 데이터가 덮어씌워질 수 있습니다.`;
    
    const confirmFill = window.confirm(message);
    if (!confirmFill) return;

    setIsGenerating(true);
    try {
      const generated = await generateSamplePlan(data.subject, data.grade, data);
      setData(prev => ({
        ...prev,
        ...generated,
        // Preserve critical identifiers or safe defaults if AI fails
        grade: generated.grade || prev.grade,
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveFile = async () => {
    const jsonString = JSON.stringify(data, null, 2);
    const fileName = `${data.year}_${data.subject || '교과'}_평가계획.json`;

    try {
      // Try to use the File System Access API to allow user to pick a path
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          }],
        });
        
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        alert('파일이 성공적으로 저장되었습니다.');
        return;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return; // User cancelled
      }
      console.warn('File System Access API failed or not supported, using fallback.', err);
    }

    // Standard download fallback (Works in all browsers)
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content);
        
        if (!parsedData || typeof parsedData !== 'object') {
             alert('올바르지 않은 파일 형식입니다.');
             return;
        }

        const confirmLoad = window.confirm('파일을 불러오면 현재 작성 중인 내용이 모두 변경됩니다. 계속하시겠습니까?');
        if (confirmLoad) {
          // Merge with initial data to ensure structure exists, but prefer parsedData if available
          // Explicitly fallback to empty arrays if they are missing in the JSON to prevent crashes
          const safeData: PlanData = {
            ...INITIAL_PLAN_DATA,
            ...parsedData,
            teachingPlans: Array.isArray(parsedData.teachingPlans) ? parsedData.teachingPlans : [],
            evaluationRows: Array.isArray(parsedData.evaluationRows) ? parsedData.evaluationRows : [],
            performanceTasks: Array.isArray(parsedData.performanceTasks) ? parsedData.performanceTasks : [],
          };
          
          setData(safeData);
          alert('성공적으로 불러왔습니다.');
        }
      } catch (error) {
        alert('파일을 읽는 중 오류가 발생했습니다.');
        console.error(error);
      } finally {
         if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset input so same file can be loaded again if needed
         }
      }
    };
    reader.readAsText(file);
  };

  const triggerLoad = () => {
    fileInputRef.current?.click();
  };

  // Adjust Scale Helper
  const adjustScale = (delta: number) => {
    setPrintScale(prev => Math.max(0.5, Math.min(1.5, Number((prev + delta).toFixed(2)))));
  };

  // --- Print Mode View (The "Screen that appears after pressing Print") ---
  if (isPrintMode) {
    return (
      <div className="bg-gray-100 min-h-screen flex flex-col print:block print:h-auto print:bg-white">
        {/* Print Toolbar */}
        <div className="fixed top-0 left-0 right-0 p-3 bg-indigo-800 text-white flex justify-between items-center z-[100] no-print shadow-lg">
            <div className="flex flex-col">
                <span className="font-bold text-lg flex items-center gap-2">
                  <Printer size={20} className="text-blue-300" /> 인쇄 설정 및 미리보기
                </span>
                <span className="text-xs text-indigo-200 mt-0.5 hidden md:inline">
                   붉은 점선은 페이지 구분선입니다. '자동 맞춤'을 사용하거나 '페이지 넘김 설정'으로 위치를 조정하세요.
                </span>
            </div>
            
            <div className="flex items-center gap-4">
                {/* Scale Controls */}
                <div className="flex items-center bg-indigo-700 rounded-lg p-1 border border-indigo-600">
                    <button 
                        onClick={() => adjustScale(-0.05)}
                        className="p-1.5 hover:bg-indigo-600 rounded text-indigo-100"
                        title="축소"
                    >
                        <ZoomOut size={16} />
                    </button>
                    <span className="mx-2 font-mono text-sm font-bold w-12 text-center">
                        {Math.round(printScale * 100)}%
                    </span>
                    <button 
                        onClick={() => adjustScale(0.05)}
                        className="p-1.5 hover:bg-indigo-600 rounded text-indigo-100"
                        title="확대"
                    >
                        <ZoomIn size={16} />
                    </button>
                    <div className="w-px h-4 bg-indigo-500 mx-2"></div>
                    <button 
                        onClick={() => setPrintScale(0.93)} // 93% is usually a safe "Fit" value
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded font-bold transition-colors"
                        title="내용이 잘리지 않게 자동으로 축소합니다"
                    >
                        <Maximize size={12} /> 자동 맞춤
                    </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer bg-indigo-700 px-3 py-2 rounded-lg border border-indigo-600 shadow-sm hover:bg-indigo-600 transition-colors" title="수행평가 영역별로 페이지를 나누어 출력합니다">
                      <input 
                          type="checkbox" 
                          checked={oneRubricPerPage} 
                          onChange={e => setOneRubricPerPage(e.target.checked)}
                          className="rounded text-indigo-200 bg-indigo-800 border-indigo-500 focus:ring-indigo-400 w-4 h-4" 
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                         <Copy size={12} /> 수행평가 쪽나눔
                      </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer bg-indigo-700 px-3 py-2 rounded-lg border border-indigo-600 shadow-sm hover:bg-indigo-600 transition-colors" title="표가 잘릴 때 강제로 다음 페이지로 넘기는 버튼을 활성화합니다.">
                      <input 
                          type="checkbox" 
                          checked={enablePageBreakControl} 
                          onChange={e => setEnablePageBreakControl(e.target.checked)}
                          className="rounded text-indigo-200 bg-indigo-800 border-indigo-500 focus:ring-indigo-400 w-4 h-4" 
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                         <FileInput size={12} /> 페이지 넘김 설정
                      </span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer bg-indigo-700 px-3 py-2 rounded-lg border border-indigo-600 shadow-sm hover:bg-indigo-600 transition-colors">
                      <input 
                          type="checkbox" 
                          checked={showPageBreaks} 
                          onChange={e => setShowPageBreaks(e.target.checked)}
                          className="rounded text-indigo-200 bg-indigo-800 border-indigo-500 focus:ring-indigo-400 w-4 h-4" 
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                         <Scissors size={12} className="transform rotate-90" /> 구분선 표시
                      </span>
                  </label>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={() => window.print()} 
                        className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-500 flex items-center gap-2 shadow-md transition-all transform hover:scale-105 text-sm"
                    >
                        <Printer size={16} /> 인쇄 시작
                    </button>
                    <button 
                        onClick={() => setIsPrintMode(false)} 
                        className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600 flex items-center gap-2 border border-gray-600 shadow-sm transition-colors text-sm"
                    >
                        <X size={16} /> 닫기
                    </button>
                </div>
            </div>
        </div>
        
        {/* Print Preview Container with Margin Controls Enabled */}
        {/* CRITICAL CHANGE: Added print: classes to reset layout flow during print */}
        <div className="flex-1 pt-24 pb-12 flex justify-center overflow-auto bg-gray-200 print:p-0 print:block print:overflow-visible print:h-auto print:bg-white">
            {/* CRITICAL CHANGE: Reset transform during print */}
            <div className="transform scale-90 sm:scale-100 origin-top transition-transform duration-200 print:transform-none print:scale-100 print:w-full print:mx-0">
                <Preview 
                  data={data} 
                  editableMargins={true} 
                  margins={printMargins} 
                  onMarginsChange={setPrintMargins} 
                  scale={printScale} // Pass Scale Prop
                  showPageBreaks={showPageBreaks} // Pass Guide visibility
                  enablePageBreakControl={enablePageBreakControl} // Pass Manual Break Control
                  oneRubricPerPage={oneRubricPerPage} // Pass Rubric Page Break toggle
                />
            </div>
        </div>
      </div>
    );
  }

  // --- Normal App View ---
  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans">
      {/* Top Navigation */}
      <header className="bg-indigo-700 text-white shadow-md sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center py-3 space-y-3">
            
            {/* Row 1: Title and Buttons */}
            <div className="flex items-center justify-between w-full relative">
              <div className="flex items-center gap-4">
                  <h1 className="text-xl font-bold flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('basic')}>
                    <FileText className="w-6 h-6" />
                    <span className="hidden md:inline">교수학습 평가계획 작성 도우미</span>
                    <span className="md:hidden">평가계획 도우미</span>
                  </h1>
              </div>

              {/* Right Side: Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Global Print Button */}
                <button 
                  onClick={() => setIsPrintMode(true)}
                  className="flex items-center gap-1 bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm border border-blue-400 mr-2"
                  title="인쇄 미리보기 및 설정 화면 열기"
                >
                  <Printer size={14} /> <span className="hidden sm:inline">인쇄/PDF</span>
                </button>

                <button 
                  onClick={handleSaveFile} 
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm border border-indigo-500"
                  title="작성 내용 저장하기 (다른 이름으로 저장)"
                >
                  <Save size={14} /> <span className="hidden sm:inline">저장</span>
                </button>
                <button 
                  onClick={triggerLoad} 
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm border border-indigo-500"
                  title="저장된 파일 불러오기"
                >
                  <FolderOpen size={14} /> <span className="hidden sm:inline">불러오기</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleLoadFile} 
                  accept=".json" 
                  className="hidden" 
                />
                
                {/* Help & Settings */}
                <a 
                  href="https://skon0215.notion.site/v1-0-2f07a37ee1588081a1bcf37ba768de24?source=copy_link"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm border border-teal-500 ml-1"
                  title="사용 설명서 보기"
                >
                  <HelpCircle size={14} /> <span className="hidden sm:inline">설명서</span>
                </a>

                <button
                  onClick={() => setShowApiKeyModal(true)}
                  className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm border border-gray-600"
                  title="API 키 설정"
                >
                  <Settings size={14} /> <span className="hidden sm:inline">설정</span>
                </button>
              </div>
            </div>

            {/* Row 2: Tabs */}
            <div className="flex space-x-1 overflow-x-auto w-full md:justify-center pb-1 scrollbar-hide">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-indigo-900 text-white shadow-inner'
                        : 'text-indigo-100 hover:bg-indigo-600'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden lg:inline">{tab.label}</span>
                    <span className="lg:hidden">{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'basic' && (
          <BasicInfo 
            data={data} 
            onChange={setData} 
          />
        )}
        {activeTab === 'analysis' && <FileAnalysis data={data} onChange={setData} />}
        {activeTab === 'plan' && <TeachingPlan data={data} onChange={setData} />}
        {activeTab === 'weights' && <EvaluationConfig data={data} onChange={setData} />}
        {activeTab === 'rubrics' && <RubricBuilder data={data} onChange={setData} />}
        {activeTab === 'preview' && (
          <>
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div className="no-print bg-blue-50 border-l-4 border-blue-400 p-4 w-full max-w-4xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="ml-3">
                  <p className="text-sm text-blue-800 font-bold">
                     이 화면은 단순 확인용 미리보기입니다.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                     인쇄 시 페이지가 잘리는 경우, <strong className="text-indigo-700">[인쇄 설정]</strong>에서 '자동 맞춤' 기능을 사용하거나 붉은 점선을 참고하여 여백을 조절하세요.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                   <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-blue-200 shadow-sm hover:bg-blue-50 transition-colors">
                      <input 
                          type="checkbox" 
                          checked={showMarginsInPreview} 
                          onChange={e => setShowMarginsInPreview(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" 
                      />
                      <span className="text-xs font-bold text-gray-700">여백 조절 점선 표시</span>
                  </label>
                  <button 
                    onClick={() => setIsPrintMode(true)} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded shadow-sm text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Printer size={16} /> 인쇄 설정 화면 열기
                  </button>
                </div>
              </div>
              <Preview 
                data={data} 
                editableMargins={showMarginsInPreview} 
                margins={printMargins} 
                onMarginsChange={setPrintMargins} 
                scale={printScale}
              />
            </div>
            
            {/* Floating Action Button for Print Mode */}
            <button 
              onClick={() => setIsPrintMode(true)} 
              className="no-print bg-indigo-700 text-white px-6 py-3 rounded-full shadow-lg hover:bg-indigo-600 transition-transform transform hover:scale-105 flex items-center gap-2 fixed bottom-8 right-8 z-50 border-2 border-white/20"
            >
              <Printer size={20} />
              인쇄 설정 및 출력
            </button>
          </>
        )}
      </main>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Key size={20} className="text-indigo-600" /> API 키 설정
              </h3>
              <button 
                onClick={() => setShowApiKeyModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
               <p className="text-sm text-gray-600 mb-4">
                 AI 기능을 사용하기 위해서는 Google Gemini API 키가 필요합니다.<br/>
                 입력된 키는 <strong>브라우저에만 저장</strong>되며 서버로 전송되지 않습니다.
               </p>
               <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Google Gemini API Key</label>
                  <input 
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="AIza..."
                  />
               </div>
               <div className="text-xs text-indigo-600 mb-6 bg-indigo-50 p-2 rounded">
                 * API 키는 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-bold">Google AI Studio</a>에서 무료로 발급받을 수 있습니다.
               </div>
               
               <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowApiKeyModal(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md text-sm font-medium"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveApiKey}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-bold shadow-sm"
                  >
                    저장하기
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
      
      {/* CSS for animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
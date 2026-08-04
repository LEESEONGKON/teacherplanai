import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 이전 버전(6단계 탭 + A4 인쇄 출력). 새 작성 도우미가 index 로 옮겨간 뒤에도
// 저장해 둔 임시 작업을 이어서 쓸 수 있도록 당분간 유지한다.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

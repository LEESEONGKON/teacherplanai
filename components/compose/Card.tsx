import React from 'react';

interface Props {
  no: number;
  title: string;
  desc: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}

/** 네 가지 작성 도구의 공통 껍데기. 순서대로 밟을 필요 없이 필요한 것만 쓰면 된다. */
const Card: React.FC<Props> = ({ no, title, desc, right, children }) => (
  <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
    <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 sm:p-5 border-b border-gray-100">
      <div className="flex gap-3">
        <span className="shrink-0 w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
          {no}
        </span>
        <div>
          <h2 className="font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      {right && <div className="shrink-0 sm:pt-1">{right}</div>}
    </header>
    <div className="p-4 sm:p-5">{children}</div>
  </section>
);

export default Card;

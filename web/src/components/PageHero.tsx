import type { ReactNode } from 'react';

interface Props {
  /** HOME / … 로 이어지는 위치 표시. 예: ['학생', '내 평가'] */
  crumbs?: string[];
  title: string;
  /** 제목 아래 영문 라벨 */
  en?: string;
  /** 한 줄 설명 */
  desc?: string;
  /** 히어로 안에 넣을 버튼들 */
  actions?: ReactNode;
  /** 네이비 단색 대신 그라디언트로 (주요 화면에만) */
  gradient?: boolean;
}

/** 하위 페이지 상단의 네이비 제목 블록. */
export default function PageHero({ crumbs = [], title, en, desc, actions, gradient }: Props) {
  return (
    <div className={gradient ? 'page-hero gradient' : 'page-hero'}>
      <div className="inner">
        <div className="crumb">{['HOME', ...crumbs].join(' / ')}</div>
        <h1>{title}</h1>
        {en && <div className="en">{en}</div>}
        {desc && <p>{desc}</p>}
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
    </div>
  );
}

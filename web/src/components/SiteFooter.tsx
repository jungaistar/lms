import { CONTACT, COPYRIGHT, EXTERNAL_LINKS, NOTICE, ORG, OWNER } from '../brand';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div className="top">
          <div>
            <div className="mark">
              {ORG.mark && <span aria-hidden="true">{ORG.mark}</span>}
              <b>{ORG.name}</b>
            </div>
            <div className="desc">
              <b>
                {OWNER.name} {OWNER.degree}
              </b>{' '}
              · {OWNER.role}
              <br />
              {OWNER.affiliation}
              <br />
              <span style={{ display: 'inline-block', marginTop: 10 }}>{NOTICE.privacy}</span>
            </div>
          </div>

          <div className="links">
            <div className="h">바로가기</div>
            {EXTERNAL_LINKS.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>

          {/* 연락처를 전부 비워 두면 'Contact' 제목만 남는다. 블록째 감춘다. */}
          {(CONTACT.email || CONTACT.phone) && (
            <div className="links">
              <div className="h">Contact</div>
              {CONTACT.email && <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>}
              {CONTACT.phone && <a href={`tel:${CONTACT.phone.replace(/-/g, '')}`}>{CONTACT.phone}</a>}
            </div>
          )}
        </div>

        <div className="bottom">
          <span className="policy">평가 결과는 성적 산출 목적으로만 사용합니다.</span>
          <span className="copy">{COPYRIGHT}</span>
        </div>
      </div>
    </footer>
  );
}

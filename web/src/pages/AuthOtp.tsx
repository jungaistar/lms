import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';

/**
 * 일회용 로그인 링크 처리.
 *
 * Supabase 가 만들어 주는 기본 링크는 프로젝트에 설정된 Site URL 로 되돌아온다.
 * 그 설정이 우리 주소와 다르면 엉뚱한 데로 튕기므로, 토큰만 받아서
 * **앱이 직접 검증**한다. 그러면 Supabase 쪽 리디렉션 설정과 무관하게 동작한다.
 *
 * 쓰임새
 *  · 비밀번호를 아직 정하지 않은 계정의 첫 로그인
 *  · 비밀번호를 잊었을 때
 */
export default function AuthOtp() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // React 18+ StrictMode 는 개발 중 effect 를 두 번 실행한다.
  // 일회용 토큰이라 두 번째 호출은 반드시 실패하므로 한 번만 쓰도록 막는다.
  const used = useRef(false);

  useEffect(() => {
    if (used.current) return;
    used.current = true;

    const tokenHash = params.get('token_hash') ?? params.get('token');
    if (!tokenHash) {
      setError('링크에 토큰이 없습니다. 주소를 끝까지 복사했는지 확인해 주세요.');
      return;
    }

    (async () => {
      const { error: err } = await teacherClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: (params.get('type') as 'magiclink' | 'recovery' | 'email') ?? 'magiclink',
      });
      if (err) {
        setError(
          /expired|invalid/i.test(err.message)
            ? '링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청하세요.'
            : `로그인하지 못했습니다: ${err.message}`,
        );
        return;
      }
      // 비밀번호가 없는 계정일 수 있으니 바로 설정 화면으로 보낸다.
      nav('/teacher/password?first=1', { replace: true });
    })();
  }, [params, nav]);

  return (
    <div className="container narrow" style={{ paddingTop: 48 }}>
      <div className="card">
        {error ? (
          <>
            <h2>로그인 실패</h2>
            <div className="alert alert-error">{error}</div>
            <Link className="btn btn-navy btn-block" to="/teacher/login">로그인 화면으로</Link>
          </>
        ) : (
          <div className="empty">
            <div className="big">🔑</div>
            로그인하는 중…
          </div>
        )}
      </div>
    </div>
  );
}

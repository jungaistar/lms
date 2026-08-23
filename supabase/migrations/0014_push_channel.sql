-- ════════════════════════════════════════════════════════════
--  보낸 기록에 '헤이영 푸시' 를 더한다
--
--  2026-08-23 에 헤이영(campus.heyoung.co.kr)을 교수 계정으로 열어 보고 알았다.
--  교수 메뉴에 **문자발송 화면이 없다.** UMS시스템 아래에 있는 것은 푸시뿐이다.
--
--    UMS시스템 → 푸시 → 푸시 전송 · 컨텐츠관리 · 전송결과 · 전송통계
--
--  0013 의 채널 목록은 문자를 헤이영으로 보낸다고 보고 만든 것이라
--  실제로 쓸 수 있는 길이 빠져 있었다. 여기서 더한다.
--
--  기존 값('heyyoung' 등)은 그대로 둔다. 이미 남은 기록을 깨지 않는다.
-- ════════════════════════════════════════════════════════════

alter table message_log
  drop constraint if exists message_log_channel_check;

alter table message_log
  add constraint message_log_channel_check
  check (channel in ('heyyoung', 'heyyoung_push', 'sms', 'email', 'share', 'copy'));

comment on column message_log.channel is
  '어느 길로 보냈나. heyyoung_push = 헤이영 UMS 푸시. 이쪽이 대행한 게 아니라 교수가 어느 버튼을 눌렀는지다.';

notify pgrst, 'reload schema';

-- ── 확인 ─────────────────────────────────────────────────────
-- 아래가 heyyoung_push 를 포함한 제약을 한 줄 내놓아야 한다.
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'message_log'::regclass
   and conname = 'message_log_channel_check';

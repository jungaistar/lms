# 02. 엔드포인트 레퍼런스

모든 경로는 `{LMS_HOST}` 기준입니다. 실제 호스트는 `.env`에 두고 커밋하지 마세요.

## 2.1 확인된 엔드포인트

### 전역 / 세션

| 기능 | 메서드 | 경로 | 비고 |
|---|---|---|---|
| 세션 체크 | POST | `/lms/common/select/getSessionInfo.dunet` | 거의 모든 화면에서 호출. 세션 생존 확인용으로 재사용 |
| 담당 과목 목록 | POST | `/lms/myLecture/doListView.dunet` | 학기별 To-Do 및 강의 리스트. `course_id` 수집의 시작점 |

### 강의실

| 기능 | 메서드 | 경로 | 필수 파라미터 |
|---|---|---|---|
| 강의실 홈 | POST | `/lms/class/classroom/doViewClassRoom.dunet`<br>`.../doViewClassRoom_new.dunet` | `course_id`, `class_no` |
| 강의계획서 | GET | `/lms/class/coursePlan/doListView.dunet` | `course_id`, `class_no` |
| 주/회차(콘텐츠) 관리 | GET | `/lms/class/course/manage/doListCourseContents.dunet` | `course_id`, `class_no` |
| 학습현황/통계 | GET | `/lms/class/studyCondition/doStudyListView.dunet` | 진도율·참여율 |

### 게시판류

| 게시판 | 메서드 | 경로 | `board_no` |
|---|---|---|---|
| 공지사항 | GET | `/lms/class/boardItem/doListView.dunet` | `7` |
| 자료실 | GET | 〃 | `6` |
| 질문답변 | GET | 〃 | `5` |
| 자유게시판 | GET | 〃 | `20` |

> 네 게시판이 **동일 엔드포인트 + `board_no` 파라미터**로 구분됩니다.
> 코드에서는 상수 맵으로 두고 하나의 함수로 처리하세요.

### 과제 (채점 파이프라인의 핵심)

| 기능 | 메서드 | 경로 | 비고 |
|---|---|---|---|
| 과제 목록 | GET | `/lms/class/report/prof/doListView.dunet` | 주차별 과제 리스트 → `report_no`, `report_seq` 획득 |
| 과제 채점 목록(학생별) | POST | `/lms/class/report/prof/doMarkView.dunet` | 학생별 제출 여부 + 취득점수 입력칸 포함 |
| 제출물 상세 / 채점 모달 | GET | `/lms/class/report/prof/doFormReportMark.dunet` | 아래 파라미터 참조 |

제출물 상세 파라미터:

```
?course_id=<COURSE_ID>
&class_no=<CLASS_NO>
&report_no=<N>
&report_seq=<N>
&user_no=<학번>
&gubun=mark
```

반환 내용: **제출 내용 본문, 첨부파일 링크, 코멘트, 현재 점수**.
채점 초안 생성에 필요한 원본 데이터가 전부 여기 있습니다.

### 성적

| 기능 | 메서드 | 경로 | 비고 |
|---|---|---|---|
| 성적산출/결과 목록 | POST | `/lms/class/courseScoreManage/doListView.dunet` | 평가기준 미설정 시 안내 문구 반환 |
| **학생 그리드 데이터** | POST | `/lms/common/courseScoreManage/doListCourseStudent.dunet` | **성적표의 핵심.** Tabulator 그리드용 데이터 |
| 페이지 정보 | POST | `/lms/common/courseScoreManage/doGetPageInfo.dunet` | 평가항목/가중치 메타데이터 |

> `doListCourseStudent.dunet` + `doGetPageInfo.dunet` 두 개를 함께 호출하면
> **학생 명단 + 평가항목 정의 + 가중치**를 한 번에 확보할 수 있습니다.
> 이게 로컬 DB 초기 적재의 시작점입니다.

### 기타 활동

| 기능 | 메서드 | 경로 |
|---|---|---|
| 퀴즈 관리 | GET | `/lms/class/exam/manage/doListView.dunet` |
| 설문 목록 | GET | `/lms/class/survey/control/doListView.dunet` |
| 설문 응답수 | POST | `/lms/class/survey/control/doGetSurveyApplyCnt.dunet` |
| 토론 관리 | GET | `/lms/class/discuss/prof/doListView.dunet` |
| 팀프로젝트 출제/채점 | GET | `/lms/class/teamproject/prof/doListView.dunet` |
| 조교 관리 | GET | `/lms/class/assist/prof/doListView.dunet` |

## 2.2 미확인 엔드포인트 (직접 호출 금지)

| 기능 | 추정 | 상태 |
|---|---|---|
| 개별 학생 점수 저장 | `doSaveReportMark.dunet` 류 | ❌ **미확인** — 파라미터·검증 로직 불명 |
| 점수 일괄 수정 | 미상 | ❌ **미확인** |
| 성적 확정 | 미상 | ❌ **미확인** |

이 셋은 **절대 추측해서 호출하지 마세요.** 성적 데이터가 깨질 수 있습니다.
→ [03. 아키텍처](03-architecture.md)의 브라우저 자동화 경로를 사용합니다.

## 2.3 호출 시 규칙

1. **요청 간 최소 1초 이상 간격**을 둡니다 (`REQUEST_INTERVAL_MS`). 병렬 폭주 금지.
2. 모든 요청에 저장된 **쿠키 자를 그대로 실어** 보냅니다.
3. `Referer` 헤더를 실제 화면 URL로 채웁니다. 서버 렌더링 앱은 이걸 검사하는 경우가 있습니다.
4. 응답에 로그인 폼이 섞여 오면 **세션 만료**로 판단하고 즉시 중단, 사람에게 재로그인을 요청합니다.
5. 조회(GET/POST) 외의 요청은 이 계층에서 아예 만들지 않습니다. 클라이언트가 읽기 전용임을 코드로 강제하세요.

---

➡️ 다음: [03. 아키텍처 제안](03-architecture.md)

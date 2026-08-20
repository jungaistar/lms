@echo off
chcp 65001 > nul
rem ===========================================================================
rem  농협사료 클론 실습본 — 로컬 배치 (더블클릭용)
rem  이 폴더의 내용을 D:\data\dev\농협 으로 복사한다.
rem  세밀한 설정이 필요하면 setup-local.ps1 을 직접 실행할 것.
rem ===========================================================================
setlocal

set "SRC=%~dp0"
set "DST=D:\data\dev\농협"

echo.
echo  농협사료 클론 실습본 — 로컬 배치
echo  --------------------------------------------
echo   원본 : %SRC%
echo   대상 : %DST%
echo.

if not exist "%SRC%index.html" (
    echo  [오류] index.html 이 없습니다. 농협 폴더 안에서 실행하세요.
    pause
    exit /b 1
)

if not exist "D:\" (
    echo  [오류] D 드라이브를 찾을 수 없습니다.
    echo         setup-local.ps1 을 -Target 옵션과 함께 실행하세요.
    pause
    exit /b 1
)

rem 괄호 블록 안에서 %ANS% 를 읽으면 파싱 시점에 빈 값으로 굳는다.
rem 그래서 블록을 쓰지 않고 goto 로 넘긴다.
if not exist "%DST%" goto :copy

echo  대상 폴더가 이미 있습니다.
set /p ANS="  덮어쓸까요? 기존 파일은 사라집니다 (y/N): "
if /i "%ANS%"=="y" goto :wipe
echo  취소했습니다.
pause
exit /b 0

:wipe
rmdir /s /q "%DST%"

:copy
mkdir "%DST%" 2>nul

rem /E 하위 폴더 포함  /I 대상을 폴더로 간주  /Y 덮어쓰기 확인 생략
xcopy "%SRC%*" "%DST%\" /E /I /Y /Q > nul

if errorlevel 1 (
    echo  [오류] 복사에 실패했습니다.
    pause
    exit /b 1
)

echo.
echo  복사 완료.
echo  브라우저로 열어 확인하세요:
echo    %DST%\index.html
echo.

set /p OPEN="  지금 열어 볼까요? (Y/n): "
if /i not "%OPEN%"=="n" start "" "%DST%\index.html"

endlocal

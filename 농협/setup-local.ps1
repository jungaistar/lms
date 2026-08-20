<#
  농협사료 클론 실습본 — 로컬 배치 스크립트
  --------------------------------------------------------------------------
  이 폴더의 내용을 D:\data\dev\농협 으로 복사한다.

  실행:
      powershell -ExecutionPolicy Bypass -File setup-local.ps1

  다른 곳에 두고 싶으면:
      powershell -ExecutionPolicy Bypass -File setup-local.ps1 -Target "E:\강의\농협"

  배치가 끝나면 인터넷 없이도 모든 기능이 그대로 동작한다.
#>

param(
    [string]$Target = "D:\data\dev\농협",
    [switch]$Force                      # 물어보지 않고 덮어쓴다
)

$ErrorActionPreference = "Stop"
$Source = $PSScriptRoot

Write-Host ""
Write-Host "농협사료 클론 실습본 — 로컬 배치" -ForegroundColor Cyan
Write-Host "--------------------------------------------"
Write-Host "  원본 : $Source"
Write-Host "  대상 : $Target"
Write-Host ""

# --- 원본이 맞는지 확인 ---------------------------------------------------
if (-not (Test-Path (Join-Path $Source "index.html"))) {
    Write-Host "index.html 이 없습니다. 이 스크립트를 농협 폴더 안에서 실행하세요." -ForegroundColor Red
    exit 1
}

# --- 드라이브가 있는지 확인 -----------------------------------------------
$drive = Split-Path -Qualifier $Target      # 예: "D:"
if (-not (Test-Path "$drive\")) {
    Write-Host "$drive 드라이브를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "  -Target 으로 다른 경로를 지정하세요. 예)" -ForegroundColor Yellow
    Write-Host '    powershell -ExecutionPolicy Bypass -File setup-local.ps1 -Target "C:\dev\농협"'
    exit 1
}

# --- 이미 있으면 물어본다 -------------------------------------------------
if ((Test-Path $Target) -and -not $Force) {
    Write-Host "대상 폴더가 이미 있습니다." -ForegroundColor Yellow
    $answer = Read-Host "  덮어쓸까요? 기존 파일은 사라집니다 (y/N)"
    if ($answer -ne "y" -and $answer -ne "Y") {
        Write-Host "취소했습니다." -ForegroundColor Yellow
        exit 0
    }
    Remove-Item -Recurse -Force $Target
}

# --- 복사 -----------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $Target | Out-Null

Get-ChildItem -Path $Source -Force |
    Where-Object { $_.Name -ne ".git" } |
    ForEach-Object {
        Copy-Item -Recurse -Force -Path $_.FullName -Destination $Target
    }

# --- 확인 -----------------------------------------------------------------
$pages = Get-ChildItem -Path $Target -Filter "*.html" -File
Write-Host ""
Write-Host "복사 완료 — HTML $($pages.Count)개" -ForegroundColor Green
foreach ($p in $pages) {
    Write-Host ("  {0,-16} {1,7:N1} KB" -f $p.Name, ($p.Length / 1KB))
}

$index = Join-Path $Target "index.html"
Write-Host ""
Write-Host "브라우저로 열어 확인하세요:" -ForegroundColor Cyan
Write-Host "  $index"
Write-Host ""

$open = Read-Host "지금 열어 볼까요? (Y/n)"
if ($open -ne "n" -and $open -ne "N") {
    Start-Process $index
}

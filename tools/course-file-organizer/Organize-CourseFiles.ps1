<#
.SYNOPSIS
  동아방송예술대 과목별로 강의 파일을 훑어 분류하고 폴더로 정리한다.

.DESCRIPTION
  두 단계로 돈다. 한 번에 옮기지 않는다 — 잘못 옮기면 되돌리기 어렵다.

    1) 훑기(Scan, 기본)  : 파일 이름 + 안의 글자를 읽어 점수를 매기고
                           `분류결과.csv` 와 `검토용_발췌.txt` 를 만든다. 파일은 건드리지 않는다.
    2) 적용(-Apply)      : `분류결과.csv` 의 `분류` 칸을 그대로 믿고 폴더로 넣는다.
                           기본은 복사(원본 유지), `-Move` 를 주면 옮긴다.

  사이에 사람이(또는 Claude 가) `분류결과.csv` 의 `분류` 칸을 고칠 수 있다.
  자동 분류가 확신하지 못한 줄은 `00_미분류` 로 두고 `점수`·`근거` 칸에 이유를 적는다.

.PARAMETER Root
  훑을 최상위 폴더. 하위 폴더까지 전부 내려간다.

.PARAMETER Dest
  정리해 넣을 곳. 비우면 `<Root>\동아방송예술대`.

.PARAMETER Apply
  주면 2단계(적용). 안 주면 1단계(훑기)만 한다.

.PARAMETER Move
  적용할 때 복사 대신 이동. 기본은 복사다.

.PARAMETER Plan
  적용할 때 읽을 csv 경로. 비우면 `<Dest>\분류결과.csv`.

.PARAMETER MinScore
  이 점수 아래면 `00_미분류`. 기본 3.

.EXAMPLE
  # 1단계 — 훑기만
  powershell -ExecutionPolicy Bypass -File .\Organize-CourseFiles.ps1

.EXAMPLE
  # 2단계 — csv 를 확인/수정한 뒤 복사로 정리
  powershell -ExecutionPolicy Bypass -File .\Organize-CourseFiles.ps1 -Apply

.EXAMPLE
  # 원본을 옮겨서 정리
  powershell -ExecutionPolicy Bypass -File .\Organize-CourseFiles.ps1 -Apply -Move
#>

[CmdletBinding()]
param(
  [string]$Root = 'G:\복구됨_F\재구성 파일\문서',
  [string]$Dest = '',
  [switch]$Apply,
  [switch]$Move,
  [string]$Plan = '',
  [int]$SnippetChars = 1200,
  [int]$MinScore = 3
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $Dest) { $Dest = Join-Path $Root '동아방송예술대' }
if (-not $Plan) { $Plan = Join-Path $Dest '분류결과.csv' }

$UNCLASSIFIED = '00_미분류'

# ── 과목 정의 ────────────────────────────────────────────────────────────────
# folder : 만들 폴더 이름
# strong : 하나만 맞아도 사실상 확정 (가중치 6)
# weak   : 여러 개 모여야 뜻이 있다 (가중치 1)
# veto   : 다른 과목의 강한 신호. 겹칠 때 깎는다 (가중치 -2)
$SUBJECTS = @(
  [ordered]@{
    key    = 'A'
    folder = '1인 예술과 창업실무'
    strong = @('1인 예술', '1인예술', '일인 예술', '1인 창조기업', '1인창조기업', '창업실무', '창업 실무')
    weak   = @('프리랜서', '개인 브랜딩', '퍼스널 브랜딩', '아티스트', '예술가', '1인 미디어', '1인미디어',
               '포트폴리오', '개인사업자', '사업자등록', '세무', '계약서', '단가', '수익 모델', '자기 브랜드')
  },
  [ordered]@{
    key    = 'B'
    folder = '자원관리능력개발'
    strong = @('자원관리능력', '자원관리 능력', '자원관리', '직업기초능력', '물적자원', '물적 자원')
    weak   = @('시간관리', '시간 관리', '예산관리', '예산 관리', '인적자원', '인적 자원', 'NCS',
               '자원 활용', '우선순위', '일정 관리', '원가', '자원 낭비', '효율', '시간자원', '예산 수립')
  },
  [ordered]@{
    key    = 'C'
    folder = '창업과 기업가정신'
    strong = @('기업가정신', '기업가 정신', '앙트러프러너', '앙트레프레너', 'entrepreneurship', 'Entrepreneurship')
    weak   = @('린 스타트업', '린스타트업', '비즈니스 모델', '비즈니스모델', '비즈니스 모델 캔버스', 'BM 캔버스',
               '사업계획서', '사업 계획서', '창업 아이템', '창업아이템', '투자유치', 'IR', '피벗', 'MVP',
               '스타트업', '데스밸리', '창업 절차', '아이디어 발상', '시장 조사')
  },
  [ordered]@{
    key    = 'D'
    folder = '취업과 경력개발'
    strong = @('경력개발', '경력 개발', '취업과 경력', '취업전략', '취업 전략', '진로설계', '진로 설계')
    weak   = @('자기소개서', '이력서', '면접', '채용', '입사', '커리어', '직무 분석', '직무분석',
               '구직', '취업', '진로', '인턴', '포트폴리오 면접', 'NCS 기반 채용', '경력 로드맵')
  },
  [ordered]@{
    key    = 'E'
    folder = '문화예술콘텐츠 창업'
    strong = @('문화예술콘텐츠', '문화예술 콘텐츠', '문화콘텐츠', '문화 콘텐츠', '예술경영', '예술 경영', '콘텐츠 창업')
    weak   = @('공연', '전시', '기획공연', '축제', '저작권', '지식재산', 'IP', '아트마켓', '문화산업',
               '크리에이터', '콘텐츠 기획', '영상 콘텐츠', '음반', '뮤지컬', '갤러리', '관객', '티켓')
  }
)

# 파일 이름에 이 말이 있으면 곧장 그 과목이다 (가중치 10)
$FILENAME_LOCK = @{
  'A' = @('1인예술', '1인 예술', '일인예술', '창업실무')
  'B' = @('자원관리')
  'C' = @('기업가정신', '기업가 정신')
  'D' = @('경력개발', '취업과경력', '취업과 경력')
  'E' = @('문화예술콘텐츠창업실무', '콘텐츠창업실무', '문화예술콘텐츠창업', '문화예술콘텐츠', '문화콘텐츠', '예술경영')
}

$TEXT_EXT   = @('.txt', '.md', '.csv', '.tsv', '.log', '.json', '.xml', '.htm', '.html')
$OOXML_EXT  = @('.pptx', '.ppsx', '.potx', '.docx', '.dotx', '.xlsx', '.xltx', '.hwpx')
$BINARY_EXT = @('.ppt', '.pps', '.pot', '.doc', '.xls', '.hwp', '.pdf')   # 이름만 보고 판단
$SKIP_EXT   = @('.tmp', '.lnk', '.ini', '.db', '.url', '.exe', '.dll', '.sys')

# ── OOXML(zip) 안의 글자 뽑기 ────────────────────────────────────────────────
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-OoxmlText {
  param([string]$Path, [int]$MaxChars = 20000)

  $wanted = '^(ppt/slides/slide\d+\.xml|ppt/notesSlides/notesSlide\d+\.xml|word/document\.xml|word/header\d*\.xml|xl/sharedStrings\.xml|Contents/section\d+\.xml|Contents/header\.xml)$'
  $sb = New-Object System.Text.StringBuilder
  $zip = $null
  try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    foreach ($e in ($zip.Entries | Where-Object { $_.FullName -match $wanted } | Sort-Object FullName)) {
      if ($sb.Length -ge $MaxChars) { break }
      $sr = New-Object System.IO.StreamReader($e.Open(), [System.Text.Encoding]::UTF8)
      try { $xml = $sr.ReadToEnd() } finally { $sr.Dispose() }
      # 문단·줄 경계를 공백으로 살려 둔 뒤 태그를 걷는다
      $xml = $xml -replace '<(a:p|w:p|w:br|a:br|hp:p)\b[^>]*>', ' '
      $xml = $xml -replace '<[^>]+>', ''
      $xml = [System.Net.WebUtility]::HtmlDecode($xml)
      $xml = $xml -replace '\s+', ' '
      [void]$sb.Append($xml).Append(' ')
    }
  } catch {
    return $null
  } finally {
    if ($zip) { $zip.Dispose() }
  }

  $t = $sb.ToString().Trim()
  if ($t.Length -gt $MaxChars) { $t = $t.Substring(0, $MaxChars) }
  return $t
}

function Get-PlainText {
  param([string]$Path, [int]$MaxChars = 20000)
  try {
    $t = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop
    $t = $t -replace '\s+', ' '
    if ($t.Length -gt $MaxChars) { $t = $t.Substring(0, $MaxChars) }
    return $t.Trim()
  } catch { return $null }
}

# ── 점수 매기기 ──────────────────────────────────────────────────────────────
# 과목별 '센 말' 을 한 곳에 모아 둔다. 아래 Test-Swallowed 가 쓴다.
$STRONG_INDEX = @{}
foreach ($s in $SUBJECTS) {
  $STRONG_INDEX[$s.key] = @($FILENAME_LOCK[$s.key]) + @($s.strong)
}

# '문화예술콘텐츠창업실무' 가 이름에 있으면 '창업실무'(다른 과목) 는 세지 않는다.
# 긴 말이 짧은 말을 먹는다 — 같은 과목끼리는 먹지 않는다.
function Test-Swallowed {
  param([string]$Word, [string]$OwnerKey, [string]$Hay)
  foreach ($s in $SUBJECTS) {
    if ($s.key -eq $OwnerKey) { continue }
    foreach ($longer in $STRONG_INDEX[$s.key]) {
      if ($longer.Length -le $Word.Length) { continue }
      if ($longer.IndexOf($Word, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
      if ($Hay -like "*$longer*") { return $true }
    }
  }
  return $false
}

function Get-Classification {
  param([string]$FileName, [string]$Text)

  $hay = ($FileName + ' ' + $Text)
  $scores  = @{}
  $reasons = @{}

  foreach ($s in $SUBJECTS) {
    $k = $s.key
    $scores[$k]  = 0
    $reasons[$k] = New-Object System.Collections.ArrayList

    foreach ($w in $FILENAME_LOCK[$k]) {
      if (($FileName -like "*$w*") -and -not (Test-Swallowed -Word $w -OwnerKey $k -Hay $FileName)) {
        $scores[$k] += 10
        [void]$reasons[$k].Add("이름:$w")
      }
    }
    foreach ($w in $s.strong) {
      if (($hay -like "*$w*") -and -not (Test-Swallowed -Word $w -OwnerKey $k -Hay $hay)) {
        $scores[$k] += 6
        [void]$reasons[$k].Add("강:$w")
      }
    }
    foreach ($w in $s.weak) {
      if ($hay -like "*$w*") {
        $scores[$k] += 1
        [void]$reasons[$k].Add("약:$w")
      }
    }
  }

  # 겹칠 때: 다른 과목의 강한 신호가 있으면 그만큼 깎는다
  $adjusted = @{}
  foreach ($s in $SUBJECTS) {
    $k = $s.key
    $penalty = 0
    foreach ($o in $SUBJECTS) {
      if ($o.key -eq $k) { continue }
      $hasStrong = $false
      foreach ($w in $STRONG_INDEX[$o.key]) {
        if (($hay -like "*$w*") -and -not (Test-Swallowed -Word $w -OwnerKey $o.key -Hay $hay)) { $hasStrong = $true; break }
      }
      if ($hasStrong) { $penalty += 2 }
    }
    $adjusted[$k] = $scores[$k] - $penalty
  }

  $best = $null; $bestScore = -999; $second = -999
  foreach ($s in $SUBJECTS) {
    $v = $adjusted[$s.key]
    if ($v -gt $bestScore) { $second = $bestScore; $bestScore = $v; $best = $s }
    elseif ($v -gt $second) { $second = $v }
  }

  $folder = $UNCLASSIFIED
  $note   = ''
  if ($bestScore -ge $MinScore) {
    if (($bestScore - $second) -lt 2) {
      $note = "접전(2위와 $($bestScore - $second)점 차)"
      $folder = $UNCLASSIFIED
    } else {
      $folder = $best.folder
    }
  } else {
    $note = "점수 미달(최고 $bestScore < $MinScore)"
  }

  $why = ($reasons[$best.key] | Select-Object -First 8) -join ', '
  if ($note) { $why = if ($why) { "$note / $why" } else { $note } }

  [pscustomobject]@{
    Folder = $folder
    Score  = $bestScore
    Why    = $why
    All    = (($SUBJECTS | ForEach-Object { "$($_.folder)=$($adjusted[$_.key])" }) -join ' | ')
  }
}

# ── 1단계: 훑기 ─────────────────────────────────────────────────────────────
function Invoke-Scan {
  if (-not (Test-Path -LiteralPath $Root)) {
    throw "훑을 폴더가 없다: $Root"
  }
  Write-Host "[훑기] $Root" -ForegroundColor Cyan

  $destFull = [System.IO.Path]::GetFullPath($Dest)
  $files = Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction SilentlyContinue |
           Where-Object { -not $_.FullName.StartsWith($destFull, [StringComparison]::OrdinalIgnoreCase) }

  Write-Host "  파일 $($files.Count) 개" -ForegroundColor DarkGray

  $rows     = New-Object System.Collections.ArrayList
  $snippets = New-Object System.Collections.ArrayList
  $i = 0

  foreach ($f in $files) {
    $i++
    if ($i % 50 -eq 0) { Write-Host "  … $i / $($files.Count)" -ForegroundColor DarkGray }

    $ext = $f.Extension.ToLowerInvariant()
    if ($SKIP_EXT -contains $ext) { continue }

    $text = $null
    $how  = '이름만'
    if ($OOXML_EXT -contains $ext)      { $text = Get-OoxmlText -Path $f.FullName; if ($text) { $how = '내용' } }
    elseif ($TEXT_EXT -contains $ext)   { $text = Get-PlainText -Path $f.FullName; if ($text) { $how = '내용' } }
    elseif ($BINARY_EXT -contains $ext) { $how = '이름만(구형식)' }

    $c = Get-Classification -FileName $f.Name -Text $text

    [void]$rows.Add([pscustomobject]@{
      순번     = $i
      분류     = $c.Folder
      점수     = $c.Score
      근거     = $c.Why
      판단자료 = $how
      파일명   = $f.Name
      확장자   = $ext
      크기KB   = [math]::Round($f.Length / 1KB, 1)
      수정일   = $f.LastWriteTime.ToString('yyyy-MM-dd')
      전체점수 = $c.All
      원본경로 = $f.FullName
    })

    $head = if ($text) { $text.Substring(0, [Math]::Min($SnippetChars, $text.Length)) } else { '(내용을 읽지 못함 — 구형식이거나 PDF)' }
    [void]$snippets.Add("### [$i] $($f.Name)`r`n경로: $($f.FullName)`r`n자동분류: $($c.Folder) (점수 $($c.Score)) — $($c.Why)`r`n발췌: $head`r`n")
  }

  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  $rows | Export-Csv -LiteralPath $Plan -NoTypeInformation -Encoding UTF8
  $snipPath = Join-Path $Dest '검토용_발췌.txt'
  Set-Content -LiteralPath $snipPath -Value ($snippets -join "`r`n") -Encoding UTF8

  Write-Host ''
  Write-Host '── 자동 분류 결과 ──' -ForegroundColor Green
  $rows | Group-Object 분류 | Sort-Object Count -Descending | ForEach-Object {
    '{0,-22} {1,5} 개' -f $_.Name, $_.Count | Write-Host
  }
  Write-Host ''
  Write-Host "분류표 : $Plan"      -ForegroundColor Yellow
  Write-Host "발췌   : $snipPath"  -ForegroundColor Yellow
  Write-Host ''
  Write-Host '분류표의 `분류` 칸을 확인·수정한 뒤 -Apply 로 다시 실행하면 폴더로 넣는다.'
}

# ── 2단계: 적용 ─────────────────────────────────────────────────────────────
function Invoke-Apply {
  if (-not (Test-Path -LiteralPath $Plan)) {
    throw "분류표가 없다: $Plan  (먼저 -Apply 없이 실행해 훑을 것)"
  }
  $rows = Import-Csv -LiteralPath $Plan -Encoding UTF8
  $verb = if ($Move) { '이동' } else { '복사' }
  Write-Host "[$verb] $($rows.Count) 줄 → $Dest" -ForegroundColor Cyan

  $done = 0; $skipped = 0
  foreach ($r in $rows) {
    $src = $r.원본경로
    if (-not (Test-Path -LiteralPath $src)) { $skipped++; continue }

    $folder = if ([string]::IsNullOrWhiteSpace($r.분류)) { $UNCLASSIFIED } else { $r.분류.Trim() }
    $targetDir = Join-Path $Dest $folder
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    $name = [System.IO.Path]::GetFileNameWithoutExtension($src)
    $ext  = [System.IO.Path]::GetExtension($src)
    $target = Join-Path $targetDir ($name + $ext)
    $n = 1
    while (Test-Path -LiteralPath $target) {
      $target = Join-Path $targetDir ("{0}_{1}{2}" -f $name, $n, $ext)
      $n++
    }

    try {
      if ($Move) { Move-Item -LiteralPath $src -Destination $target }
      else       { Copy-Item -LiteralPath $src -Destination $target }
      $done++
    } catch {
      Write-Warning "$verb 실패: $src — $($_.Exception.Message)"
      $skipped++
    }
  }

  Write-Host ''
  Write-Host "$verb 완료 $done 개, 건너뜀 $skipped 개" -ForegroundColor Green
  Get-ChildItem -LiteralPath $Dest -Directory | ForEach-Object {
    $c = (Get-ChildItem -LiteralPath $_.FullName -File -Recurse).Count
    '{0,-22} {1,5} 개' -f $_.Name, $c | Write-Host
  }
}

if ($Apply) { Invoke-Apply } else { Invoke-Scan }

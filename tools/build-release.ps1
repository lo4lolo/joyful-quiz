$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$tag = 'JoyfulQuiz-v' + $package.version + '-windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$releaseRoot = Join-Path $projectRoot 'release'
$outputDir = Join-Path $releaseRoot $tag
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
foreach ($name in @('public','server','node_modules','server.js','package.json','package-lock.json','README.md','THIRD_PARTY_NOTICES.md','시작하기.cmd','인수인계.md','교사용_사용가이드_v0.6.html')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $outputDir -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $outputDir 'tools'),(Join-Path $outputDir 'runtime'),(Join-Path $outputDir 'docs') | Out-Null
foreach($name in @('doctor.mjs','open-teacher.mjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $outputDir 'tools') }
foreach($name in @('V05_GUIDE.md','HANDOFF_V05_2026-10-29.md','RELEASE_CHECK_V05.md','HANDOFF_V06_2026-10-30.md','UIUX_V06.md','DEPLOY.md','DESIGN.md')) { if(Test-Path -LiteralPath (Join-Path $projectRoot ('docs\'+$name))) { Copy-Item -LiteralPath (Join-Path $projectRoot ('docs\'+$name)) -Destination (Join-Path $outputDir 'docs') } }
$nodePath = (Get-Command node -ErrorAction Stop).Source
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $outputDir 'runtime\node.exe')
$licensePath = Join-Path (Split-Path $nodePath) 'LICENSE'
if(!(Test-Path -LiteralPath $licensePath)) { $nodeVersion = (& $nodePath --version).Trim(); $licensePath = Join-Path $projectRoot ('docs\vendor-licenses\NODE-LICENSE-'+$nodeVersion+'.txt') }
if(!(Test-Path -LiteralPath $licensePath)) { throw 'Node runtime license is missing. Add the official license matching node --version before packaging.' }
Copy-Item -LiteralPath $licensePath -Destination (Join-Path $outputDir 'runtime\NODE-LICENSE.txt')
Push-Location $outputDir
try { & '.\runtime\node.exe' 'tools\doctor.mjs'; if($LASTEXITCODE -ne 0) { throw 'Release file check failed.' } } finally { Pop-Location }
$archivePath = Join-Path $releaseRoot ($tag+'.zip')
Compress-Archive -LiteralPath $outputDir -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output $archivePath

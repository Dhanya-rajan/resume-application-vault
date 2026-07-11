$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeRoot = "C:\Users\dhany\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$toolRoot = "C:\Users\dhany\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
$nextCli = Join-Path $projectRoot "node_modules\next\dist\bin\next"

$env:Path = "$nodeRoot;$toolRoot;$env:Path"
Set-Location $projectRoot

& "$nodeRoot\node.exe" $nextCli dev --hostname 127.0.0.1 --port 3000

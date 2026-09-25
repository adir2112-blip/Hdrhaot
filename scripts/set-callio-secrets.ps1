# Stores the per-org Callio knowledge webhook URL + token as Supabase Edge
# Function secrets (read by supabase/functions/kb-to-callio). Values are typed
# here only - never put them in git or chat. Re-run any time to rotate.
$ErrorActionPreference = 'Stop'
$ProjectRef = 'hbjtpjdthvjikfxsufdo'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Read-Url($label) {
  while ($true) {
    $u = (Read-Host "$label webhook URL").Trim()
    if ($u -match '^https://\S+$') { return $u }
    Write-Host '  Must start with https:// - try again.' -ForegroundColor Yellow
  }
}
function Read-Token($label) {
  while ($true) {
    $s = Read-Host "$label token (hidden)" -AsSecureString
    $t = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
    if ($t.Length -ge 8 -and $t -notmatch '\s') {
      if ($t -like 'clo_live_*') {
        Write-Host '  This looks like a TELEPHONY key (clo_live_). Use the dedicated KNOWLEDGE token.' -ForegroundColor Red
        continue
      }
      return $t
    }
    Write-Host '  Token looks empty/invalid - try again.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '=== Supabase login check ===' -ForegroundColor Cyan
# --agent no: the CLI otherwise may detect an "AI agent" environment and
# refuse interactive prompts (NonInteractiveError).
npx --yes supabase projects list --agent no *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Not logged in - opening browser for Supabase login...'
  npx --yes supabase login --agent no
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Browser login did not work. Use an access token instead:' -ForegroundColor Yellow
    Write-Host '  1. Open https://supabase.com/dashboard/account/tokens'
    Write-Host '  2. "Generate new token", name it e.g. "cli", copy it'
    Start-Process 'https://supabase.com/dashboard/account/tokens'
    $s = Read-Host 'Paste the Supabase access token (hidden)' -AsSecureString
    $sbTok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
    npx --yes supabase login --agent no --token $sbTok
    if ($LASTEXITCODE -ne 0) { throw 'Supabase login failed' }
  }
}

Write-Host ''
Write-Host '=== Movement (מובמנט) ===' -ForegroundColor Cyan
$movUrl = Read-Url 'Movement'
$movTok = Read-Token 'Movement'
Write-Host ''
Write-Host '=== Allen Carr (אלן קאר) ===' -ForegroundColor Cyan
$acUrl = Read-Url 'Allen Carr'
$acTok = Read-Token 'Allen Carr'

if ($movTok -eq $acTok) { throw 'Both orgs got the same token - each org must have its own.' }

$envFile = Join-Path $env:TEMP ("callio-secrets-" + [guid]::NewGuid() + '.env')
try {
  @(
    "CALLIO_URL_MOVEMENT=`"$movUrl`""
    "CALLIO_TOKEN_MOVEMENT=`"$movTok`""
    "CALLIO_URL_ALLEN_CARR=`"$acUrl`""
    "CALLIO_TOKEN_ALLEN_CARR=`"$acTok`""
  ) | Set-Content -Path $envFile -Encoding ASCII
  npx --yes supabase secrets set --agent no --env-file $envFile --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
} finally {
  Remove-Item $envFile -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Saved. Secret names now on the project (values are not shown):' -ForegroundColor Green
npx --yes supabase secrets list --agent no --project-ref $ProjectRef | Select-String 'CALLIO_'
Write-Host ''
Write-Host 'Done - tell Claude "saved". Close this window.' -ForegroundColor Green

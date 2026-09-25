# Stores the per-org Callio knowledge webhook URL + token as Supabase Edge
# Function secrets (read by supabase/functions/kb-to-callio). Values are typed
# here only - never put them in git or chat. Re-run any time to rotate.
# Continue, not Stop: in PowerShell 5.1 any stderr line from npx would
# otherwise abort the script. Failures are checked via $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
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
npx.cmd --yes supabase projects list --agent no *> $null
# Browser login needs a TTY, which npx does not give the CLI here — so log in
# with a personal access token (saved by the CLI for later deploys).
$tries = 0
while ($LASTEXITCODE -ne 0) {
  if (++$tries -gt 3) { throw 'Supabase login failed 3 times' }
  Write-Host 'Not logged in to Supabase. A browser page is opening:' -ForegroundColor Yellow
  Write-Host '  1. Click "Generate new token", name it "cli", and copy it'
  Write-Host '  2. Paste it below (it will not be shown) and press Enter'
  Start-Process 'https://supabase.com/dashboard/account/tokens'
  $s = Read-Host 'Supabase access token (hidden)' -AsSecureString
  $sbTok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
  npx.cmd --yes supabase login --agent no --token $sbTok *> $null
  # login --token does not validate the token — this does.
  npx.cmd --yes supabase projects list --agent no *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host '  That token did not work - try again.' -ForegroundColor Red }
}
Write-Host 'Logged in to Supabase.' -ForegroundColor Green

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
  npx.cmd --yes supabase secrets set --agent no --env-file $envFile --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw 'supabase secrets set failed' }
} finally {
  Remove-Item $envFile -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Saved. Secret names now on the project (values are not shown):' -ForegroundColor Green
npx.cmd --yes supabase secrets list --agent no --project-ref $ProjectRef | Select-String 'CALLIO_'
Write-Host ''
Write-Host 'Done - tell Claude "saved". Close this window.' -ForegroundColor Green

# Logs the Supabase CLI in with a personal access token, so Claude can run
# migrations / deploys. Browser login needs a TTY, which npx does not give the
# CLI here — hence the token. The token is typed here only, never in chat.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host ''
Write-Host '=== Supabase login ===' -ForegroundColor Cyan
npx.cmd --yes supabase projects list --agent no *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host 'Already logged in.' -ForegroundColor Green
} else {
  Write-Host 'A browser page is opening:' -ForegroundColor Yellow
  Write-Host '  1. Click "Generate new token", name it "cli"'
  Write-Host '  2. Give it access to the briefings project (Database, Edge Functions, Projects), ~7 days'
  Write-Host '  3. Copy it, paste below (it will not be shown), press Enter'
  Start-Process 'https://supabase.com/dashboard/account/tokens'
  $tries = 0
  while ($LASTEXITCODE -ne 0) {
    if (++$tries -gt 3) { Write-Host 'Login failed 3 times.' -ForegroundColor Red; exit 1 }
    $s = Read-Host 'Supabase access token (hidden)' -AsSecureString
    $tok = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
    npx.cmd --yes supabase login --agent no --token $tok *> $null
    # login --token does not validate the token — this does.
    npx.cmd --yes supabase projects list --agent no *> $null
    if ($LASTEXITCODE -ne 0) { Write-Host '  That token did not work - try again.' -ForegroundColor Red }
  }
  Write-Host 'Logged in to Supabase.' -ForegroundColor Green
}
Write-Host ''
Write-Host 'Done - tell Claude "connected". You can close this window.' -ForegroundColor Green

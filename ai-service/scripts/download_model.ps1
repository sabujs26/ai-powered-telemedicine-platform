<#
  Downloads the three model files from Hugging Face at a PINNED commit (so a later change to the
  repository cannot silently swap the files), then records their SHA-256 hashes.

  Run from the ai-service folder:
      powershell -ExecutionPolicy Bypass -File .\scripts\download_model.ps1

  Free: no account, API key or paid service is needed. Total download is about 400 KB.
  NOTE: we deliberately do NOT download disease_info.json - its treatment fields are wrong.
#>
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Revision = "c87dc2f5f8f96cfec3580fa4b739e8044398ad15"
$Base     = "https://huggingface.co/NatiTs/Disease-Prediction-Model/resolve/$Revision"
$Dest     = Join-Path $PSScriptRoot "..\model"
$Files    = @("disease_prediction_model.h5", "label_encoder.pkl", "symptoms_list.json")

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

foreach ($f in $Files) {
    $out = Join-Path $Dest $f
    Write-Host "Downloading $f ..."
    try {
        Invoke-WebRequest -Uri "$Base/$f" -OutFile $out -UseBasicParsing
    } catch {
        Write-Host "FAILED to download $f : $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    if ((Get-Item $out).Length -lt 100) {
        Write-Host "$f looks empty or truncated - aborting." -ForegroundColor Red
        exit 1
    }
}

$lines = foreach ($f in $Files) {
    $hash = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $Dest $f)).Hash.ToLower()
    "$hash  $f"
}

$sumFile = Join-Path $Dest "SHA256SUMS.txt"
if (-not (Test-Path $sumFile)) {
    $lines | Set-Content -Encoding ascii $sumFile
    Write-Host "`nPinned these hashes in model\SHA256SUMS.txt (the service refuses to start if a file later changes):"
} else {
    Write-Host "`nSHA256SUMS.txt already exists and was NOT overwritten. Hashes of what you just downloaded:"
}
$lines | ForEach-Object { Write-Host "  $_" }
Write-Host "`nNext: python scripts\inspect_model.py"

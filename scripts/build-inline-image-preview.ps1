param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [string]$Alt = 'preview',
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ShortWindowsPath {
  param([string]$ResolvedPath)

  try {
    $fs = New-Object -ComObject Scripting.FileSystemObject
    return $fs.GetFile($ResolvedPath).ShortPath
  }
  catch {
    return $null
  }
}

function Convert-ToForwardSlashPath {
  param([string]$ResolvedPath)

  $normalized = $ResolvedPath -replace '\\', '/'
  return $normalized
}

function Convert-ToCodexFileLinkTarget {
  param([string]$ResolvedPath)

  $normalized = $ResolvedPath -replace '\\', '/'
  if ($normalized.StartsWith('/')) {
    return $normalized
  }

  return '/' + $normalized
}

function Test-CodexLocalImagePath {
  param([string]$Path)

  return (
    ($Path.StartsWith('/') -and -not $Path.StartsWith('//')) -or
    ($Path -match '^[A-Za-z]:[\\/]') -or
    ($Path -match '^(//[^/]+/[^/]+|\\\\[^\\]+\\[^\\]+)')
  )
}

function Convert-ToHtmlAttributeValue {
  param([string]$Value)

  return (
    $Value.
      Replace('&', '&amp;').
      Replace('"', '&quot;').
      Replace('<', '&lt;').
      Replace('>', '&gt;')
  )
}

function Get-StagedInlineImagePath {
  param(
    [string]$ResolvedSource,
    [System.IO.FileInfo]$SourceInfo
  )

  $tempRoot = [System.IO.Path]::GetTempPath().TrimEnd('\')
  $deliveryRoot = Join-Path $tempRoot 'codex-inline-cache'
  New-Item -ItemType Directory -Path $deliveryRoot -Force | Out-Null

  $hashInput = '{0}|{1}|{2}' -f $ResolvedSource, $SourceInfo.Length, $SourceInfo.LastWriteTimeUtc.Ticks
  $hashBytes = [System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($hashInput))
  $hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').Substring(0, 10).ToLowerInvariant()
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($SourceInfo.Name)
  $extension = [System.IO.Path]::GetExtension($SourceInfo.Name)
  $sanitizedBaseName = ($baseName -replace '[^A-Za-z0-9_-]', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($sanitizedBaseName)) {
    $sanitizedBaseName = 'image'
  }

  $deliveryPath = Join-Path $deliveryRoot ($sanitizedBaseName + '-' + $hash + $extension.ToLowerInvariant())
  if (-not (Test-Path -LiteralPath $deliveryPath)) {
    Copy-Item -LiteralPath $ResolvedSource -Destination $deliveryPath -Force
  }
  else {
    $deliveryInfo = Get-Item -LiteralPath $deliveryPath
    if ($deliveryInfo.Length -ne $SourceInfo.Length -or $deliveryInfo.LastWriteTimeUtc -lt $SourceInfo.LastWriteTimeUtc) {
      Copy-Item -LiteralPath $ResolvedSource -Destination $deliveryPath -Force
    }
  }

  return $deliveryPath
}

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source not found: $Source"
}

$resolvedSource = (Resolve-Path -LiteralPath $Source).Path
$sourceInfo = Get-Item -LiteralPath $resolvedSource
$shortSource = Get-ShortWindowsPath -ResolvedPath $resolvedSource
$inlineResolvedPath = $resolvedSource
$deliveryMode = 'original'

if ($null -ne $shortSource -and $shortSource.Trim().Length -gt 0 -and -not $shortSource.Contains(' ')) {
  $inlineResolvedPath = $shortSource
  $deliveryMode = 'short-path'
}
elseif ($resolvedSource.Contains(' ')) {
  $inlineResolvedPath = Get-StagedInlineImagePath -ResolvedSource $resolvedSource -SourceInfo $sourceInfo
  $deliveryMode = 'staged-copy'
}

$inlinePath = Convert-ToForwardSlashPath -ResolvedPath $inlineResolvedPath
$fileLinkTarget = Convert-ToCodexFileLinkTarget -ResolvedPath $resolvedSource
$passesLocalPathCheck = Test-CodexLocalImagePath -Path $inlinePath

Write-Output ('SOURCE=' + $resolvedSource)
Write-Output ('DELIVERY_MODE=' + $deliveryMode)
if ($null -ne $shortSource -and $shortSource.Trim().Length -gt 0) {
  Write-Output ('SHORT_PATH=' + $shortSource)
}
Write-Output ('SAFE_LOCAL_PATH=' + $inlineResolvedPath)
Write-Output ('INLINE_PATH=' + $inlinePath)
Write-Output ('PASSES_APP_LOCAL_PATH_CHECK=' + $passesLocalPathCheck.ToString().ToLowerInvariant())
Write-Output ('MARKDOWN=![{0}](<{1}>)' -f $Alt, $inlinePath)
Write-Output ('FILE_LINK=[{0}](<{1}>)' -f $sourceInfo.Name, $fileLinkTarget)

if ($PSBoundParameters.ContainsKey('OutputPath') -and $null -ne $OutputPath -and $OutputPath.Trim().Length -gt 0) {
  Write-Output ('NOTE=OutputPath is ignored. Windows Codex inline images now prefer a no-space short path, and fall back to a staged no-space copy when needed.')
}

Write-Output ('RULE=Internal image inspection must use SAFE_LOCAL_PATH only. Do not call view_image with SOURCE when SOURCE contains spaces.')

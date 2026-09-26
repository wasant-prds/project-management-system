param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($null -eq $bash) {
    throw "Git Bash is required. Install Git for Windows or run scripts/db-manage.sh in Bash."
}

$scriptPath = Join-Path $PSScriptRoot "db-manage.sh"
& $bash.Source $scriptPath @Arguments
exit $LASTEXITCODE

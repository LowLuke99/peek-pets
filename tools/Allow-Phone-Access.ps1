<#
  Lets phones on your LOCAL network reach the Peek Pets Companion.
  Run as administrator (the companion's "Fix it…" button does this for you).

  What it does:
    1. Removes old Peek Pets firewall rules and any Block rule Windows made for
       the companion (e.g. if a firewall prompt was dismissed).
    2. Adds ONE inbound Allow rule: TCP ports <Port> (pet) and <Port>+1 (installable
       app, HTTPS), only from your local subnet, only for the companion program.
       Nothing from the internet is allowed.
  It does not change your Wi-Fi's Public/Private setting.
#>
param(
    [int]$Port = 8787,
    [string]$Program = ""
)

$ErrorActionPreference = 'Stop'
$name = 'Peek Pets Companion (local network)'

Write-Host "Peek Pets - allowing phones on your local network" -ForegroundColor Magenta

Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Program) {
    Get-NetFirewallApplicationFilter -Program $Program -ErrorAction SilentlyContinue |
        Get-NetFirewallRule | Where-Object { $_.Action -eq 'Block' -and $_.Direction -eq 'Inbound' } |
        ForEach-Object { Write-Host "Removing block rule: $($_.DisplayName)"; $_ | Remove-NetFirewallRule }
}

$ruleArgs = @{
    DisplayName   = $name
    Description   = 'Lets your phone talk to the Peek Pets Companion over Wi-Fi. Local subnet only.'
    Direction     = 'Inbound'
    Action        = 'Allow'
    Protocol      = 'TCP'
    LocalPort     = @($Port, $Port + 1)
    RemoteAddress = 'LocalSubnet'
    Profile       = 'Any'
}
if ($Program) { $ruleArgs.Program = $Program }
New-NetFirewallRule @ruleArgs | Out-Null

Write-Host "Done: TCP $Port and $($Port + 1) are open to devices on your local network only." -ForegroundColor Green
Start-Sleep -Seconds 2

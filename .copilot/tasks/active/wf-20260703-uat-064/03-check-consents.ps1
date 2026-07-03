$env_file = "C:\Users\tvolo\dev\ai-dala\aiqadam\apps\api\.env"
$line = Select-String -Path $env_file -Pattern '^DIRECTUS_TOKEN=' | Select-Object -First 1
$tok = $line.Line.Substring('DIRECTUS_TOKEN='.Length).Trim()

# AC-2: check that uat-member-c is in directus_users
Write-Host "=== AC-2: GET /users?filter[email][_eq]=uat-member-c@aiqadam.test ==="
$url2 = "http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test&fields=id,email,external_identifier,provider,status"
try {
    $r = Invoke-WebRequest -Uri $url2 -Method GET -Headers @{"Authorization"="Bearer $tok"} -UseBasicParsing -TimeoutSec 15
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY: $($r.Content)"
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
}

# AC-3: check member_consents for that user
Write-Host ""
Write-Host "=== AC-3: GET /items/member_consents (no member FK — empty for now) ==="
$url3 = "http://localhost:8200/items/member_consents?filter[purpose][_eq]=events&fields=id,member,purpose,revoked_at,source&limit=5"
try {
    $r = Invoke-WebRequest -Uri $url3 -Method GET -Headers @{"Authorization"="Bearer $tok"} -UseBasicParsing -TimeoutSec 15
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY: $($r.Content)"
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
}

# Alternative AC-3: just list any member_consents with purpose=events
Write-Host ""
Write-Host "=== AC-3-alt: all events-purpose consents ==="
$url3a = "http://localhost:8200/items/member_consents?filter[purpose][_eq]=events&fields=id,member.email,purpose,revoked_at,source&limit=10"
try {
    $r = Invoke-WebRequest -Uri $url3a -Method GET -Headers @{"Authorization"="Bearer $tok"} -UseBasicParsing -TimeoutSec 15
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY: $($r.Content)"
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.ReadToEnd()
    }
}
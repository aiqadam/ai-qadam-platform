$env_file = "C:\Users\tvolo\dev\ai-dala\aiqadam\apps\api\.env"
$line = Select-String -Path $env_file -Pattern '^DIRECTUS_TOKEN=' | Select-Object -First 1
$tok = $line.Line.Substring('DIRECTUS_TOKEN='.Length).Trim()

# List directus users
$url = "http://localhost:8200/users?filter[email][_in]=uat-operator@aiqadam.test,uat-member-c@aiqadam.test,uat-member-nc@aiqadam.test&fields=id,email,external_identifier,provider,status"
try {
    $r = Invoke-WebRequest -Uri $url -Method GET -Headers @{"Authorization"="Bearer $tok"} -UseBasicParsing -TimeoutSec 15
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY:"
    $r.Content
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.ReadToEnd()
    }
}
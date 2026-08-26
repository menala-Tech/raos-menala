# RAOS 129 local harness

This harness requires Docker and runs only in a disposable `postgres:16-alpine`
container. It creates a minimal schema, applies the legacy baseline, applies
`raos_129_shift_middle_windows.sql`, and stops on the first assertion failure.
It never connects to Supabase.

From the repository root in PowerShell:

```powershell
$name = 'raos129-harness'
$root = (Get-Location).Path
docker run --rm -d --name $name -e POSTGRES_PASSWORD=harness postgres:16-alpine
try {
  do {
    Start-Sleep -Seconds 1
    $ready = docker exec $name pg_isready -U postgres 2>$null
  } until ($LASTEXITCODE -eq 0)
  docker run --rm --network "container:$name" -v "${root}:/repo:ro" postgres:16-alpine `
    psql -h 127.0.0.1 -U postgres -d postgres -f /repo/sql/tests/raos_129_middle_window_harness.sql
} finally {
  docker rm -f $name 2>$null | Out-Null
}
```

Every acceptance row calls the real attendance RPCs. The harness computes each
target timestamp at runtime and temporarily shifts the stub branch timezone by
an offset if a target would otherwise be future or inside the RPC's
five-minute clamp.
It fails explicitly if the resulting offset is outside the permitted
approximately six-minute-to-24-hour band.

# 개발 실행 스크립트
#
# 서버 주소와 공개 API 키는 option_env! 라 **컴파일 시점**에 박힌다.
# 그냥 `npm run tauri:dev` 를 치면 소스의 기본값으로 빌드되므로 이 스크립트를 쓸 것.
#
#   .\run-dev.ps1
#
# BCR_API_ANON_KEY 는 Supabase publishable key 다. 클라이언트에 배포되도록
# 설계된 공개 키이므로 저장소에 두어도 된다. secret / service_role 키와 혼동 금지.

$ErrorActionPreference = "Stop"

# cmake / NASM / LLVM 경로를 확실히 잡는다 (새 터미널에서 PATH 반영이 안 된 경우 대비)
$env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [Environment]::GetEnvironmentVariable("PATH", "User")
$env:LIBCLANG_PATH = [Environment]::GetEnvironmentVariable("LIBCLANG_PATH", "User")

$env:BCR_API_BASE_URL = "https://vthqlfcuspqmuvazfncf.supabase.co/functions/v1"
$env:BCR_API_ANON_KEY = "sb_publishable_3Br9v1xYLLXyeLsuMlcb8g_gNmLUC16"

Write-Host "API base : $env:BCR_API_BASE_URL" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot
npm run tauri:dev

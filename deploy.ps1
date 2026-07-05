# deploy.ps1 - Deploy 402found.dev to Cloudflare Pages
Write-Host "Deploying 402found.dev to Cloudflare Pages..." -ForegroundColor Cyan

wrangler pages deploy . --project-name 402found-dev

Write-Host ""
Write-Host "Done! Check above for your deployment URL." -ForegroundColor Green
Read-Host "Press Enter to exit"

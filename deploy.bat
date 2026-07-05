@echo off
echo Deploying 402found.dev to Cloudflare Pages...
wrangler pages deploy . --project-name 402found-dev
echo.
echo Done! Check above for your deployment URL.
pause

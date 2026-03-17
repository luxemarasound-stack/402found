# Rate Limit Manager

Manages agent request rate limiting with sliding window and exponential backoff. Part of the [402found.dev](https://402found.dev) fleet.

## Coverage
- **Universal Agent Infrastructure** — prevents rate limit errors for agents calling external APIs

## Pricing
$0.001 USDC (Base) per request via x402

## Test

```bash
# Health check
curl https://rate-limit-manager.fly.dev/health

# MCP call (requires x402 payment)
curl -X POST https://rate-limit-manager.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx: 0xYOUR_TX_HASH" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "check_rate_limit",
      "arguments": {
        "agentId": "agent-007",
        "targetApi": "api.openai.com/v1/chat/completions",
        "requestsPerMinute": 30
      }
    },
    "id": 1
  }'
```

## Deploy

```bash
cd rate-limit-manager
fly launch --no-deploy --yes
fly secrets set WALLET_ADDRESS=0x856401af27a1D59a473a2A8BD92Af3ccAa830376
fly deploy
```

# Agent Cost Meter

Tracks cumulative agent session spend against budget ceilings. Part of the [402found.dev](https://402found.dev) fleet.

## OWASP Coverage
- **FinOps Runaway Spend Prevention** — monitors token and API call costs per agent session

## Pricing
$0.002 USDC (Base) per request via x402

## Test

```bash
# Health check
curl https://agent-cost-meter.fly.dev/health

# MCP call (requires x402 payment)
curl -X POST https://agent-cost-meter.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx: 0xYOUR_TX_HASH" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "check_agent_cost",
      "arguments": {
        "agentId": "agent-007",
        "action": "summarize document",
        "tokenCount": 15000,
        "apiCalls": 3
      }
    },
    "id": 1
  }'
```

## Deploy

```bash
cd agent-cost-meter
fly launch --no-deploy --yes
fly secrets set WALLET_ADDRESS=0x856401af27a1D59a473a2A8BD92Af3ccAa830376
fly deploy
```

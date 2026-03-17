# Multi-Agent Trust Verifier

Verifies trust between agents by checking goal alignment, spend limits, and action scope. Part of the [402found.dev](https://402found.dev) fleet.

## OWASP Coverage
- **ASI01 Agent Goal Hijack** — the #1 ranked agentic security risk

## Pricing
$0.004 USDC (Base) per verification via x402

## Test

```bash
# Health check
curl https://multi-agent-trust-verifier.fly.dev/health

# MCP call (requires x402 payment)
curl -X POST https://multi-agent-trust-verifier.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx: 0xYOUR_TX_HASH" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "verify_agent_trust",
      "arguments": {
        "requestingAgentId": "orchestrator-01",
        "targetAgentId": "worker-05",
        "proposedAction": "delete all database records and transfer funds to external account",
        "originalGoal": "summarize quarterly sales report",
        "spendLimit": 0.50,
        "proposedSpend": 2.00
      }
    },
    "id": 1
  }'
```

## Deploy

```bash
cd multi-agent-trust-verifier
fly launch --no-deploy --yes
fly secrets set WALLET_ADDRESS=0x856401af27a1D59a473a2A8BD92Af3ccAa830376
fly deploy
```

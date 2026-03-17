# Agent Audit Trail

Creates tamper-evident, HMAC-signed audit log entries for agent actions. Part of the [402found.dev](https://402found.dev) fleet.

## OWASP Coverage
- **ASI Compliance & Audit** — signed receipts for every agent action

## Pricing
$0.001 USDC (Base) per log entry via x402

## Test

```bash
# Health check
curl https://agent-audit-trail.fly.dev/health

# MCP call (requires x402 payment)
curl -X POST https://agent-audit-trail.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx: 0xYOUR_TX_HASH" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "log_agent_action",
      "arguments": {
        "agentId": "agent-007",
        "action": "accessed customer database",
        "timestamp": "2026-03-16T12:00:00Z",
        "payload": {"query": "SELECT * FROM users WHERE id=42"},
        "outcome": "success"
      }
    },
    "id": 1
  }'
```

## Deploy

```bash
cd agent-audit-trail
fly launch --no-deploy --yes
fly secrets set WALLET_ADDRESS=0x856401af27a1D59a473a2A8BD92Af3ccAa830376
fly secrets set HMAC_SECRET=your-strong-secret-here
fly deploy
```

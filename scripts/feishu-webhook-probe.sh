#!/usr/bin/env bash
# Simulate Feishu webhook callbacks to verify your callback URL.
# Usage: ./scripts/feishu-webhook-probe.sh <base_url>
# Example: ./scripts/feishu-webhook-probe.sh https://breann-ungenuine-crusily.ngrok-free.dev

set -e
BASE_URL="${1:-https://breann-ungenuine-crusily.ngrok-free.dev}"
WEBHOOK_URL="${BASE_URL%/}/feishu/events"

echo "=== Feishu webhook probe: $WEBHOOK_URL ==="
echo ""

echo "1. URL verification (what Feishu sends when you save the request URL)"
RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test-challenge-123"}')
BODY=$(echo "$RESP" | sed '/^HTTP_CODE:/d' | tr -d '\n')
CODE=$(echo "$RESP" | grep '^HTTP_CODE:' | cut -d: -f2)
echo "   Response body: $BODY"
echo "   HTTP status:   $CODE"
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q '"challenge":"test-challenge-123"'; then
  echo "   => OK (Feishu URL verification would succeed)"
else
  echo "   => FAIL (expected 200 and {\"challenge\":\"test-challenge-123\"})"
fi
echo ""

echo "2. Message event (simulated im.message.receive_v1)"
RESP=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event_callback",
    "event": {
      "type": "im.message.receive_v1",
      "message": {
        "message_id": "om_probe",
        "chat_id": "oc_probe",
        "chat_type": "p2p",
        "content": "{\"text\":\"probe\"}",
        "create_time": "0"
      },
      "sender": {
        "sender_id": {"open_id": "ou_probe", "user_id": "probe"}
      }
    }
  }')
BODY=$(echo "$RESP" | sed '/^HTTP_CODE:/d' | tr -d '\n')
CODE=$(echo "$RESP" | grep '^HTTP_CODE:' | cut -d: -f2)
echo "   Response body: $BODY"
echo "   HTTP status:   $CODE"
if [ "$CODE" = "200" ]; then
  echo "   => OK (gateway accepted the event; check gateway logs for feishu: received message)"
else
  echo "   => Unexpected status (expected 200)"
fi
echo ""
echo "Done. If 1 fails, Feishu URL verification will fail (e.g. ngrok interstitial)."
echo "If 2 returns 200, your gateway received the event; reply depends on routing/agent."

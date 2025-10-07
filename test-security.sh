#!/bin/bash

echo "🔒 Testing Security Features"
echo "=============================="
echo ""

BASE_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📝 Test 1: Valid Login"
echo "----------------------"
response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}')

if echo "$response" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Login successful${NC}"
  echo "$response" | jq .
else
  echo -e "${RED}❌ Login failed${NC}"
  echo "$response" | jq .
fi

echo ""
echo "📝 Test 2: Invalid Login (Wrong Password)"
echo "------------------------------------------"
response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrongpassword"}')

if echo "$response" | grep -q 'Invalid username or password'; then
  echo -e "${GREEN}✅ Correctly rejected invalid credentials${NC}"
else
  echo -e "${RED}❌ Should reject invalid credentials${NC}"
fi

echo ""
echo "📝 Test 3: Rate Limiting (6 rapid attempts)"
echo "--------------------------------------------"
for i in {1..6}; do
  echo -n "Attempt $i: "
  response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}')

  if echo "$response" | grep -q 'Too many'; then
    echo -e "${RED}RATE LIMITED${NC}"
    echo "$response" | jq .
    break
  else
    echo -e "${YELLOW}Allowed${NC}"
  fi
  sleep 0.5
done

echo ""
echo "📝 Test 4: Input Validation"
echo "---------------------------"
response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"ab"}')

if echo "$response" | grep -q 'Invalid input\|Validation'; then
  echo -e "${GREEN}✅ Input validation working${NC}"
  echo "$response" | jq .
else
  echo -e "${RED}❌ Input validation not working${NC}"
  echo "$response" | jq .
fi

echo ""
echo "📝 Test 5: CSRF Token in Login Response"
echo "---------------------------------------"
response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}')

if echo "$response" | grep -q 'csrfToken'; then
  echo -e "${GREEN}✅ CSRF token present in response${NC}"
  echo "$response" | jq '.csrfToken' | head -c 50
  echo "..."
else
  echo -e "${RED}❌ CSRF token missing${NC}"
fi

echo ""
echo "📝 Test 6: Sanitized Logging Check"
echo "----------------------------------"
echo "Checking Docker logs for sensitive data..."
logs=$(docker compose -f docker-compose.local.yml logs app --tail=20 2>/dev/null)

if echo "$logs" | grep -q "password.*admin"; then
  echo -e "${RED}❌ WARNING: Password found in logs!${NC}"
else
  echo -e "${GREEN}✅ No sensitive data in logs${NC}"
fi

echo ""
echo "=============================="
echo "🎉 Security Tests Complete!"
echo "=============================="

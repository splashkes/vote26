#!/bin/bash
# Delete Abandoned Accounts from Stripe API
# Deletes the 73 accounts that were removed from database

set +e  # Don't exit on error

# Stripe API keys (from environment or prompt)
if [ -z "$stripe_canada_secret_key" ]; then
  echo "Error: stripe_canada_secret_key not set in environment"
  exit 1
fi

if [ -z "$stripe_intl_secret_key" ]; then
  echo "Error: stripe_intl_secret_key not set in environment"
  exit 1
fi

STRIPE_CA_KEY="$stripe_canada_secret_key"
STRIPE_INTL_KEY="$stripe_intl_secret_key"

echo "========================================="
echo "DELETING ABANDONED ACCOUNTS FROM STRIPE"
echo "========================================="
echo ""

# Array of accounts: stripe_id|country|name
declare -a ACCOUNTS=(
  "acct_1SRFo11h9LxTd2BN|CA|Morgan Currie"
  "acct_1SPQ8ZBVKGI5J32G|US|Victoria Grassmid"
  "acct_1SPAZl12EmsgEbXn|CA|JJ Normandeau"
  "acct_1SMryl0krB3kzvKL|CA|Aileen McQueen"
  "acct_1SMhmn0YESimJ4bH|CA|Raevyn Berg"
  "acct_1SL2bSP57vBslvuC|CA|Abolfazl Mirgalouibayat"
  "acct_1SKT6VBGpTSHCRqK|US|Kenly"
  "acct_1SKQ28BSPvJP3yry|US|P-Ro"
  "acct_1SKO8I086dj1mYik|CA|Armela Mema"
  "acct_1SJyyB01Ao03Dty4|CA|Lisa Lynn Adams"
  "acct_1SJLLv0vwcsqpivC|CA|Simon Plashkes"
  "acct_1SIdHk0kd2qO54qG|CA|Patrick.S.Greene"
  "acct_1SIbcT0LK20I3GbJ|CA|Daniel Martelock"
  "acct_1STR5i0ixvmgf96o|CA|Sofia Hernandez"
  "acct_1SIV3a1dCHFREHc2|CA|Trevor Ball"
  "acct_1SJvOcP3YaXVgNZf|CA|Silvia"
  "acct_1SIfxH1RnlUDHcuW|CA|Rob Nicholson"
  "acct_1SIX350uVRMWXT00|CA|Sawsan Hussein Shorbajee"
  "acct_1SHoomBh72SLNEu9|US|Tiffany Burkey"
  "acct_1SJ3150vtuLd9k9U|CA|MEDĒIO"
  "acct_1SGkBR0YiUz8J2Pc|CA|Keith williams"
  "acct_1SGfZlB2zF7wVBY9|TH|iamthesenseinu"
  "acct_1SKoDi1WqnhqHTl2|CA|Christopher Padayachee"
  "acct_1SGTSy0Z1DS4sYzz|CA|Marc Belanger"
  "acct_1SGKJqB54Sx4iEhO|US|Emily Kwong"
  "acct_1SFcPO0lmkcOkMPh|CA|Julia Ioannou"
  "acct_1SFM2dPg6reQBCEl|TH|Pahas Tongting"
  "acct_1SFKDdBnoS4IuVil|TH|Watthana Petchkeaw"
  "acct_1SKMdu0oS5GVztvq|CA|Kareem David James Mitchell"
  "acct_1SF1MY0qlcIxaV4o|CA|Makhdoom Sadiq Khan"
  "acct_1SEwaM0E54prBGwz|CA|Kyla Yager"
  "acct_1SEuoU0OwDtNsOrG|CA|Mariia Charuta"
  "acct_1SEh4qBAuMspUsRy|NZ|Cindy Nguyen"
  "acct_1SHTN71jNVIymicp|CA|Cory Hall"
  "acct_1SEelw09Yw7gpwUr|CA|Ghazal Alkassab"
  "acct_1SRE54PZKGcLGfYf|US|Alana Tucker"
  "acct_1SEFt5PlkO2fAsTt|US|Sarah Mason"
  "acct_1SECweB5svcqdkQg|NL|JULIO europe TEST TEST"
  "acct_1SECVI1dNTvlTac2|CA|Julio Test instagram Window"
  "acct_1SEANcB1VctMeYz8|US|Prabin Badhia"
  "acct_1SDeVm0J6Cj0sKoa|CA|WATT"
  "acct_1SDRlcPmLWjNxKav|US|Chad Divel"
  "acct_1SDGTS17VWUbHVZk|CA|Heather Chytil"
  "acct_1STmGOBo5YXHGqPu|US|Allie Overgaard"
  "acct_1SEZjs0JCUKrARJn|CA|Julia Davids"
  "acct_1SClDVBIWkG8pPlY|US|Nicole Zimmer"
  "acct_1SCiiZB0QcLsCdnr|AU|Sohyun Bae"
  "acct_1SCYixP0VIAArKSX|CA|Cedric Taillon"
  "acct_1SDoiU1yAZXti6Z3|CA|Vanessa Hill"
  "acct_1SBvJz1D37bvgAXW|CA|Mandy Kaur"
  "acct_1SBk850eWaoiBrf2|CA|Makhdoom Sadiq Khan"
  "acct_1SBfqOBCPB1Z5Vq2|US|Ysabel Ledesma Portilla"
  "acct_1SB7wGBrSatS3rVT|AU|Poppi Hmelnitsky"
  "acct_1SB5AGAxAhvsIUCk|AU|Nicolas Nunez Diaz"
  "acct_1SO36K1IOmAih3fG|CA|Victor Hernández"
  "acct_1SB2M2BXtjde14by|US|ashley a petrash"
  "acct_1SAqUnBQClRn1n88|AU|Eve"
  "acct_1SD7o01vb3WOfh1c|CA|Andrea Michelle Proano Munoz"
  "acct_1SABK20iykWmN3T1|CA|Kyla Yager"
  "acct_1SJInD1RRGNMK2PZ|CA|Audrey Greenlees"
  "acct_1SEtxV0bVIIr4C3H|CA|Kelsey Nelson"
  "acct_1S914yB4Md7CRu7N|TH|Sarocha Sriapinyayotin"
  "acct_1S8nxfPjx53yFGhG|US|Tina Baylor"
  "acct_1S8ZJIBGTjkT1j3N|US|Marcell D. Williams"
  "acct_1SG1Ji1piSaE6IXm|CA|Heather Morrison"
  "acct_1S6cOEBRtld9XZFp|NZ|NZ4"
  "acct_1S6bqpB4HgZqTus2|NZ|NZ TEst"
  "acct_1S6bjnPVuEC4rc7s|AU|AU TEST 333"
  "acct_1S6b9jBTc5YtlSgr|AU|AU TEST"
  "acct_1S6aTPBeFLPqxyfr|NL|NL Test"
  "acct_1S6aJYBRW5Ud1aik|US|Test Ottawa Canada"
  "acct_1S6a4APkj1KWbX53|US|TEST US"
  "acct_1S6a1KBrqQlR075g|US|Tesgin Thailand"
)

TOTAL=${#ACCOUNTS[@]}
SUCCESS=0
ALREADY_DELETED=0
FAILED=0

echo "Found $TOTAL accounts to delete from Stripe API"
echo ""

for account in "${ACCOUNTS[@]}"; do
  IFS='|' read -r stripe_id country name <<< "$account"

  # Select correct API key
  if [ "$country" = "CA" ]; then
    API_KEY="$STRIPE_CA_KEY"
  else
    API_KEY="$STRIPE_INTL_KEY"
  fi

  # Delete from Stripe
  RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "https://api.stripe.com/v1/accounts/${stripe_id}" \
    -u "${API_KEY}:")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ DELETED: $stripe_id ($name - $country)"
    SUCCESS=$((SUCCESS + 1))
  elif [ "$HTTP_CODE" = "404" ]; then
    echo "⚠ ALREADY DELETED: $stripe_id ($name - $country)"
    ALREADY_DELETED=$((ALREADY_DELETED + 1))
  else
    echo "✗ FAILED: $stripe_id ($name - $country) - HTTP $HTTP_CODE"
    ERROR=$(echo "$BODY" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$ERROR" ]; then
      echo "  Error: $ERROR"
    fi
    FAILED=$((FAILED + 1))
  fi

  # Small delay to avoid rate limiting
  sleep 0.1
done

echo ""
echo "========================================="
echo "SUMMARY"
echo "========================================="
echo "Total accounts: $TOTAL"
echo "Successfully deleted: $SUCCESS"
echo "Already deleted: $ALREADY_DELETED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "⚠ Some deletions failed. Check errors above."
  exit 1
else
  echo "✓ All accounts processed successfully!"
  echo ""
  echo "Reminder emails should stop within 24 hours."
fi

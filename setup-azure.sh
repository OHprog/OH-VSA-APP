#!/usr/bin/env bash
# =============================================================================
# OH-VSA-APP — Azure infrastructure setup
# Reads secrets from pipeline/.env and frontend/.env.local automatically.
# Prerequisites: az CLI logged in, gh CLI logged in
# Usage: bash OH-VSA-APP/setup-azure.sh   (run from repo root)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =============================================================================
# CONFIGURATION — edit these before running
# =============================================================================

RESOURCE_GROUP="rg-oh-vsa-app"
LOCATION="westeurope"
APP_SERVICE_PLAN="plan-vsa-pipeline"
WEBAPP_NAME="vsa-pipeline"      # Must be globally unique → azurewebsites.net
SWA_NAME="vsa-frontend"         # Must be globally unique → azurestaticapps.net
GITHUB_REPO="OHprog/OH-VSA-APP"
SUPABASE_PROJECT_REF="mhmflwuztabcqchmxjnp"

# =============================================================================
# Load secrets from env files
# =============================================================================

echo ">>> Loading secrets from env files"

# pipeline/.env — pipeline secrets (SUPABASE_URL, FIRECRAWL_API_KEY, MONGODB_URI, etc.)
set -a
# shellcheck disable=SC1091
source "$SCRIPT_DIR/pipeline/.env"
set +a

# frontend/.env.local — frontend keys (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_ACCESS_TOKEN)
set -a
# shellcheck disable=SC1091
source "$SCRIPT_DIR/frontend/.env.local"
set +a

# =============================================================================
# 1. Resource Group
# =============================================================================

echo ""
echo ">>> Creating resource group: $RESOURCE_GROUP in $LOCATION"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# =============================================================================
# 2. Azure Static Web App (frontend)
# =============================================================================

echo ""
echo ">>> Creating Static Web App: $SWA_NAME"
az staticwebapp create \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Free \
  --output table

SWA_URL="https://$(az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query defaultHostname \
  --output tsv)"

echo "Static Web App URL: $SWA_URL"

echo ""
echo ">>> Setting Static Web App application settings"
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names \
    VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
    VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
    VITE_PIPELINE_URL="https://$WEBAPP_NAME.azurewebsites.net" \
  --output table

SWA_TOKEN=$(az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.apiKey" \
  --output tsv)

# =============================================================================
# 3. Azure App Service (pipeline)
# =============================================================================

echo ""
echo ">>> Creating App Service plan: $APP_SERVICE_PLAN (B1 Linux)"
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku B1 \
  --is-linux \
  --output table

echo ""
echo ">>> Creating Web App: $WEBAPP_NAME (Node 20)"
az webapp create \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "NODE:20-lts" \
  --output table

echo ""
echo ">>> Setting startup command"
az webapp config set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --startup-file "node api/server.js" \
  --output none

echo ""
echo ">>> Configuring App Service environment variables"
az webapp config appsettings set \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    SUPABASE_URL="$SUPABASE_URL" \
    SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
    SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
    FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY" \
    MONGODB_URI="$MONGODB_URI" \
    MONGODB_DB_NAME="$MONGODB_DB_NAME" \
    AIML_API_KEY="$AIML_API_KEY" \
    AIML_BASE_URL="$AIML_BASE_URL" \
    PORT="3001" \
    CORS_ORIGIN="$SWA_URL" \
  --output table
# Note: HTTP_PROXY / HTTPS_PROXY intentionally excluded — not needed from cloud

PUBLISH_PROFILE=$(az webapp deployment list-publishing-profiles \
  --name "$WEBAPP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --xml)

# =============================================================================
# 4. GitHub Secrets
# =============================================================================

echo ""
echo ">>> Setting GitHub secrets on $GITHUB_REPO"

gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN \
  --body "$SWA_TOKEN" \
  --repo "$GITHUB_REPO"

gh secret set AZURE_WEBAPP_PUBLISH_PROFILE \
  --body "$PUBLISH_PROFILE" \
  --repo "$GITHUB_REPO"

gh secret set AZURE_WEBAPP_NAME \
  --body "$WEBAPP_NAME" \
  --repo "$GITHUB_REPO"

# =============================================================================
# 5. Supabase Edge Function secret
# =============================================================================

echo ""
echo ">>> Updating Supabase Edge Function PIPELINE_API_URL"
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" supabase secrets set \
  PIPELINE_API_URL="https://$WEBAPP_NAME.azurewebsites.net" \
  --project-ref "$SUPABASE_PROJECT_REF"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "============================================================"
echo " Setup complete!"
echo "============================================================"
echo " Frontend : $SWA_URL"
echo " Pipeline : https://$WEBAPP_NAME.azurewebsites.net"
echo " Health   : curl https://$WEBAPP_NAME.azurewebsites.net/health"
echo ""
echo " Next: push to main branch to trigger GitHub Actions deploys"
echo "============================================================"

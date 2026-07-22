.DEFAULT_GOAL := help

.PHONY: help install build test deploy secrets

WRANGLER := npx wrangler

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dbbackup worker dependencies on the host
	npm install

build: ## Typecheck the dbbackup worker on the host
	npm run build

test: ## Run the dbbackup worker test suite on the host
	npm test

deploy: ## Deploy the dbbackup Cloudflare Worker (D1 -> Google Drive daily backup)
	$(WRANGLER) deploy

secrets: ## Set all dbbackup Worker secrets interactively (CF + Google OAuth); see SETUP.md
	$(WRANGLER) secret put CF_API_TOKEN
	$(WRANGLER) secret put CF_ACCOUNT_ID
	$(WRANGLER) secret put CF_DATABASE_ID
	$(WRANGLER) secret put GOOGLE_CLIENT_ID
	$(WRANGLER) secret put GOOGLE_CLIENT_SECRET
	$(WRANGLER) secret put GOOGLE_REFRESH_TOKEN

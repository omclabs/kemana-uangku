.DEFAULT_GOAL := help

.PHONY: help start-dev stop restart migrate test logs logs-web shell shell-web build clean \
	api-install web-install api-test web-build api-build \
	deploy-db-backup deploy-api-migrate deploy-api deploy-api-secret deploy-api-origins \
	deploy-web deploy-web-preview deploy-all \
	backup-db-prod restore-db-local

API_DIR := api
WEB_DIR := web
WRANGLER := npx wrangler
API_BASE_URL ?=
ALLOWED_ORIGINS ?=
APP_GIT_SHA := $(shell git -C $(CURDIR) rev-parse --short HEAD)
BUILD_TIME_UTC := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
API_APP_VERSION := $(shell node -p "require('./api/package.json').version")
WEB_APP_VERSION := $(shell node -p "require('./web/package.json').version")
DB_BACKUP_TIMESTAMP := $(shell date +"%Y%m%d-%H%M%S")
DB_BACKUP_DIR := backups
DB_BACKUP_FILE := $(DB_BACKUP_DIR)/db-$(DB_BACKUP_TIMESTAMP).sql

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

start-dev: ## Build and start the full dev environment: api on :8787, web on :5173 (runs migrations automatically)
	docker compose up --build

stop: ## Stop the dev environment
	docker compose down

restart: stop start-dev ## Restart the dev environment

migrate: ## Apply new D1 migrations to the running container (no restart)
	docker compose exec api npm run migrate

test: ## Run the api test suite inside the container
	docker compose exec api npm test

logs: ## Follow api container logs
	docker compose logs -f api

logs-web: ## Follow web container logs
	docker compose logs -f web

shell: ## Open a shell in the running api container
	docker compose exec api sh

shell-web: ## Open a shell in the running web container
	docker compose exec web sh

build: ## Build the api and web Docker images
	docker compose build

clean: ## Stop and remove containers + the node_modules volumes (D1 data is bind-mounted and untouched)
	docker compose down -v

api-install: ## Install api dependencies on the host
	cd $(API_DIR) && npm install

web-install: ## Install web dependencies on the host
	cd $(WEB_DIR) && npm install

api-test: ## Run the api test suite on the host
	cd $(API_DIR) && npm test

api-build: ## Typecheck the api on the host
	cd $(API_DIR) && npm run build

web-build: ## Build the web app; requires API_BASE_URL
	@if [ -z "$(API_BASE_URL)" ]; then echo "API_BASE_URL is required. Example: make web-build API_BASE_URL=https://kemana-uangku-api.example.workers.dev"; exit 1; fi
	cd $(WEB_DIR) && VITE_API_BASE_URL="$(API_BASE_URL)" VITE_APP_VERSION="$(WEB_APP_VERSION)" VITE_COMMIT_SHA="$(APP_GIT_SHA)" VITE_BUILD_TIME="$(BUILD_TIME_UTC)" npm run build

deploy-api-secret: ## Set the Worker API_TOKEN secret interactively
	cd $(API_DIR) && $(WRANGLER) secret put API_TOKEN

deploy-api-origins: ## Set the Worker ALLOWED_ORIGINS secret interactively
	@if [ -z "$(ALLOWED_ORIGINS)" ]; then echo "ALLOWED_ORIGINS is required. Example: make deploy-api-origins ALLOWED_ORIGINS=https://kemana-uangku.your-account.workers.dev,https://app.example.com"; exit 1; fi
	cd $(API_DIR) && printf '%s' "$(ALLOWED_ORIGINS)" | $(WRANGLER) secret put ALLOWED_ORIGINS

deploy-db-backup: ## Export the remote D1 database to backups/db-yyyymmdd-hhmmss.sql
	mkdir -p $(DB_BACKUP_DIR)
	cd $(API_DIR) && $(WRANGLER) d1 export kemana-uangku-db --remote --output ../$(DB_BACKUP_FILE) -y
	@echo "Database backup written to $(DB_BACKUP_FILE)"

backup-db-prod: ## Interactive: backup production D1 to backups/<yyyymmdd>-<unixtime>.sql (prompts for auth/confirmation)
	@bash scripts/db-backup-prod.sh

restore-db-local: ## Interactive: restore a backups/*.sql file into the local D1 database (prompts for file/confirmation)
	@bash scripts/db-restore-local.sh

deploy-api-migrate: ## Apply remote D1 migrations
	cd $(API_DIR) && $(WRANGLER) d1 migrations apply kemana-uangku-db --remote

deploy-api: ## Deploy the Cloudflare Worker api
	cd $(API_DIR) && $(WRANGLER) deploy --var APP_VERSION:"$(API_APP_VERSION)" --var COMMIT_SHA:"$(APP_GIT_SHA)" --var DEPLOYED_AT:"$(BUILD_TIME_UTC)"

deploy-web: web-build ## Build and deploy the production web assets to the Cloudflare Worker frontend
	cd $(WEB_DIR) && $(WRANGLER) deploy
	@echo "Web deployed from $(WEB_DIR)/dist"

deploy-web-preview: ## Preview the production web build locally; requires API_BASE_URL
	@if [ -z "$(API_BASE_URL)" ]; then echo "API_BASE_URL is required. Example: make deploy-web-preview API_BASE_URL=https://kemana-uangku-api.example.workers.dev"; exit 1; fi
	cd $(WEB_DIR) && VITE_API_BASE_URL="$(API_BASE_URL)" VITE_APP_VERSION="$(WEB_APP_VERSION)" VITE_COMMIT_SHA="$(APP_GIT_SHA)" VITE_BUILD_TIME="$(BUILD_TIME_UTC)" npm run build && npm run preview -- --host 0.0.0.0

deploy-all: ## If remote migrations exist, backup DB then migrate; always deploy api and web
	@set -e; \
	MIGRATION_STATUS="$$(cd $(API_DIR) && $(WRANGLER) d1 migrations list kemana-uangku-db --remote)"; \
	if printf '%s\n' "$$MIGRATION_STATUS" | grep -q "No migrations to apply!"; then \
		echo "No unapplied production migrations detected."; \
	else \
		echo "Unapplied production migrations detected."; \
		$(MAKE) deploy-db-backup; \
		$(MAKE) deploy-api-migrate; \
	fi; \
	$(MAKE) deploy-api; \
	$(MAKE) deploy-web API_BASE_URL="$(API_BASE_URL)"; \
	echo "Deploy flow complete."

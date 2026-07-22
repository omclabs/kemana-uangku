.DEFAULT_GOAL := help

.PHONY: help install test build deploy-secret deploy-origins db-backup backup-prod restore-local deploy-migrate deploy

WRANGLER := npx wrangler
ALLOWED_ORIGINS ?=
APP_GIT_SHA := $(shell git rev-parse --short HEAD)
BUILD_TIME_UTC := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
API_APP_VERSION := $(shell node -p "require('./package.json').version")
DB_BACKUP_TIMESTAMP := $(shell date +"%Y%m%d-%H%M%S")
DB_BACKUP_DIR := ../backups
DB_BACKUP_FILE := $(DB_BACKUP_DIR)/db-$(DB_BACKUP_TIMESTAMP).sql

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install api dependencies on the host
	npm install

test: ## Run the api test suite on the host
	npm test

build: ## Typecheck the api on the host
	npm run build

deploy-secret: ## Set the Worker API_TOKEN secret interactively
	$(WRANGLER) secret put API_TOKEN

deploy-origins: ## Set the Worker ALLOWED_ORIGINS secret interactively
	@if [ -z "$(ALLOWED_ORIGINS)" ]; then echo "ALLOWED_ORIGINS is required. Example: make deploy-origins ALLOWED_ORIGINS=https://kemana-uangku.your-account.workers.dev,https://app.example.com"; exit 1; fi
	printf '%s' "$(ALLOWED_ORIGINS)" | $(WRANGLER) secret put ALLOWED_ORIGINS

db-backup: ## Export the remote D1 database to ../backups/db-yyyymmdd-hhmmss.sql
	mkdir -p $(DB_BACKUP_DIR)
	$(WRANGLER) d1 export kemana-uangku-db --remote --output $(DB_BACKUP_FILE) -y
	@echo "Database backup written to $(DB_BACKUP_FILE)"

backup-prod: ## Interactive: backup production D1 to ../backups/<yyyymmdd>-<unixtime>.sql (prompts for auth/confirmation)
	@bash ../scripts/db-backup-prod.sh

restore-local: ## Interactive: restore a ../backups/*.sql file into the local D1 database (prompts for file/confirmation)
	@bash ../scripts/db-restore-local.sh

deploy-migrate: ## Apply remote D1 migrations
	$(WRANGLER) d1 migrations apply kemana-uangku-db --remote

deploy: ## Deploy the Cloudflare Worker api
	$(WRANGLER) deploy --var APP_VERSION:"$(API_APP_VERSION)" --var COMMIT_SHA:"$(APP_GIT_SHA)" --var DEPLOYED_AT:"$(BUILD_TIME_UTC)"

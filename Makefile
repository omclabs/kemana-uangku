.DEFAULT_GOAL := help

.PHONY: help start-dev stop restart migrate test logs logs-web shell shell-web build clean \
	api-install web-install api-test web-build api-build \
	deploy-db-backup deploy-api-migrate deploy-api deploy-api-secret deploy-api-origins \
	deploy-web deploy-web-preview deploy-all \
	backup-db-prod restore-db-local \
	dbbackup-install dbbackup-build dbbackup-test deploy-dbbackup dbbackup-secrets

API_DIR := api
WRANGLER := npx wrangler
API_BASE_URL ?=
ALLOWED_ORIGINS ?=

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
	$(MAKE) -C api install

web-install: ## Install web dependencies on the host
	$(MAKE) -C web install

api-test: ## Run the api test suite on the host
	$(MAKE) -C api test

api-build: ## Typecheck the api on the host
	$(MAKE) -C api build

web-build: ## Build the web app; requires API_BASE_URL
	$(MAKE) -C web build API_BASE_URL="$(API_BASE_URL)"

deploy-api-secret: ## Set the Worker API_TOKEN secret interactively
	$(MAKE) -C api deploy-secret

deploy-api-origins: ## Set the Worker ALLOWED_ORIGINS secret interactively
	$(MAKE) -C api deploy-origins ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)"

deploy-db-backup: ## Export the remote D1 database to backups/db-yyyymmdd-hhmmss.sql
	$(MAKE) -C api db-backup

backup-db-prod: ## Interactive: backup production D1 to backups/<yyyymmdd>-<unixtime>.sql (prompts for auth/confirmation)
	$(MAKE) -C api backup-prod

restore-db-local: ## Interactive: restore a backups/*.sql file into the local D1 database (prompts for file/confirmation)
	$(MAKE) -C api restore-local

deploy-api-migrate: ## Apply remote D1 migrations
	$(MAKE) -C api deploy-migrate

deploy-api: ## Deploy the Cloudflare Worker api
	$(MAKE) -C api deploy

deploy-web: ## Build and deploy the production web assets to the Cloudflare Worker frontend
	$(MAKE) -C web deploy API_BASE_URL="$(API_BASE_URL)"

deploy-web-preview: ## Preview the production web build locally; requires API_BASE_URL
	$(MAKE) -C web deploy-preview API_BASE_URL="$(API_BASE_URL)"

dbbackup-install: ## Install dbbackup worker dependencies on the host
	$(MAKE) -C workers/dbbackup install

dbbackup-build: ## Typecheck the dbbackup worker on the host
	$(MAKE) -C workers/dbbackup build

dbbackup-test: ## Run the dbbackup worker test suite on the host
	$(MAKE) -C workers/dbbackup test

deploy-dbbackup: ## Deploy the dbbackup Cloudflare Worker (D1 -> Google Drive daily backup)
	$(MAKE) -C workers/dbbackup deploy

dbbackup-secrets: ## Set all dbbackup Worker secrets interactively (CF + Google OAuth); see workers/dbbackup/SETUP.md
	$(MAKE) -C workers/dbbackup secrets

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

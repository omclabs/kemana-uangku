.DEFAULT_GOAL := help

.PHONY: help start-dev stop restart migrate test logs logs-web shell shell-web build clean

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

.DEFAULT_GOAL := help

.PHONY: help install build deploy deploy-preview

WRANGLER := npx wrangler
API_BASE_URL ?=
APP_GIT_SHA := $(shell git rev-parse --short HEAD)
BUILD_TIME_UTC := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
WEB_APP_VERSION := $(shell node -p "require('./package.json').version")

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install web dependencies on the host
	npm install

build: ## Build the web app; requires API_BASE_URL
	@if [ -z "$(API_BASE_URL)" ]; then echo "API_BASE_URL is required. Example: make build API_BASE_URL=https://kemana-uangku-api.example.workers.dev"; exit 1; fi
	VITE_API_BASE_URL="$(API_BASE_URL)" VITE_APP_VERSION="$(WEB_APP_VERSION)" VITE_COMMIT_SHA="$(APP_GIT_SHA)" VITE_BUILD_TIME="$(BUILD_TIME_UTC)" npm run build

deploy: build ## Build and deploy the production web assets to the Cloudflare Worker frontend
	$(WRANGLER) deploy
	@echo "Web deployed from dist"

deploy-preview: ## Preview the production web build locally; requires API_BASE_URL
	@if [ -z "$(API_BASE_URL)" ]; then echo "API_BASE_URL is required. Example: make deploy-preview API_BASE_URL=https://kemana-uangku-api.example.workers.dev"; exit 1; fi
	VITE_API_BASE_URL="$(API_BASE_URL)" VITE_APP_VERSION="$(WEB_APP_VERSION)" VITE_COMMIT_SHA="$(APP_GIT_SHA)" VITE_BUILD_TIME="$(BUILD_TIME_UTC)" npm run build && npm run preview -- --host 0.0.0.0

.PHONY: build serve dev test e2e check clean

PORT ?= 4173
PYTEST ?= python3 -m pytest

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

## Build the static site into dist/ – upload the contents of that folder to any web host
build: node_modules
	npm run build

## Build, then serve dist/ locally exactly as it will be deployed
serve: build
	npx vite preview --port $(PORT) --strictPort

## Development server with hot reload
dev: node_modules
	npm run dev

test: node_modules
	npm test

## End-to-end tests in Google Chrome against the production build
e2e: node_modules
	npm run test:e2e

## Everything the CI runs: types, lint, formatting, unit and e2e tests, build, Python importers
check: node_modules
	npm run typecheck
	npm run lint
	npm run format:check
	npm test
	npm run build
	@git status --porcelain -- public/data/schema; test -z "$$(git status --porcelain -- public/data/schema)"
	npm run test:e2e
	ruff check scripts
	ruff format --check scripts
	$(PYTEST)

clean:
	rm -rf dist

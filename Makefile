.PHONY: build serve dev test check clean

PORT ?= 4173

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

## Everything the CI runs: types, formatting, tests incl. data validation, build, Python importers
check: node_modules
	npm run typecheck
	npm run format:check
	npm test
	npm run build
	git diff --exit-code -- public/data/schema
	ruff check scripts
	ruff format --check scripts

clean:
	rm -rf dist

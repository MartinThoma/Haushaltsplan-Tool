.PHONY: build serve dev test clean

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

clean:
	rm -rf dist

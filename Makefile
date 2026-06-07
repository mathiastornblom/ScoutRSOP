VERSION  := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
DATE     := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS  := -X github.com/mathiast/scoutrsop/internal/update.AppVersion=$(VERSION) \
            -X github.com/mathiast/scoutrsop/internal/update.BuildDate=$(DATE) \
            -s -w

.PHONY: all dev ui build build-all clean tidy

all: build

## dev: run backend (Go) and frontend (Vite) in parallel for local development
dev:
	@echo "→ Starting dev servers…"
	@cd web && npm run dev &
	@go run -ldflags "$(LDFLAGS)" . --port 8080

## ui: build the React frontend into web/dist
ui:
	cd web && npm install && npm run build

## build: build a single binary for the current OS/arch (requires ui first)
build: ui
	go build -ldflags "$(LDFLAGS)" -o scoutrsop .

## build-all: cross-compile for Windows, Linux, and macOS (arm64 + amd64)
build-all: ui
	mkdir -p dist
	GOOS=windows GOARCH=amd64  go build -ldflags "$(LDFLAGS)" -o dist/scoutrsop-windows-amd64.exe .
	GOOS=linux   GOARCH=amd64  go build -ldflags "$(LDFLAGS)" -o dist/scoutrsop-linux-amd64 .
	GOOS=linux   GOARCH=arm64  go build -ldflags "$(LDFLAGS)" -o dist/scoutrsop-linux-arm64 .
	GOOS=darwin  GOARCH=amd64  go build -ldflags "$(LDFLAGS)" -o dist/scoutrsop-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64  go build -ldflags "$(LDFLAGS)" -o dist/scoutrsop-darwin-arm64 .
	@echo "Binaries in dist/:"
	@ls -lh dist/

## tidy: tidy Go modules
tidy:
	go mod tidy

## clean: remove built artifacts
clean:
	rm -rf dist scoutrsop web/dist

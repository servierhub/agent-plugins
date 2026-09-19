# Concise developer facade; package.json scripts remain canonical.
.PHONY: help clean test bundle release install

help:
	@printf '%s\n' 'Agent Plugins developer commands (Bun package runner):' '  make clean                        Remove generated root outputs safely' '  make test                         Run the canonical test suite' '  make bundle                       Stage runtime plugin for this OS/architecture' '  make release [OUTPUT=path]        Validate/package every pinned target' '  make install [DEST=path]          Install current staging (project-local default)' '               [SOURCE=path] [DRY_RUN=1] [FORCE=1]'

clean:
	bun run clean

test:
	bun run test

bundle:
	bun run bundle

release:
	bun run release -- $(if $(OUTPUT),--output "$(OUTPUT)",)

install:
	bun run install:staged -- $(if $(SOURCE),--source "$(SOURCE)",) $(if $(DEST),--destination "$(DEST)",) $(if $(DRY_RUN),--dry-run,) $(if $(FORCE),--force,)

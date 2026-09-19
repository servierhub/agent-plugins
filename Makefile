# Concise developer facade; package.json scripts remain canonical.
.PHONY: help clean test bundle release install-plugin bundle-install-plugin install-plugin-local install install-local

help:
	@printf '%s\n' 'Agent Plugins developer commands (Bun package runner):' '  make clean                               Remove generated root outputs safely' '  make test                                Run the canonical test suite' '  make bundle                              Stage runtime plugin for this OS/architecture' '  make release [OUTPUT=path]               Validate/package every pinned target' '  make install-plugin [DEST=path]          Install full plugin staging -> .agents/plugins' '                      [SOURCE=path] [DRY_RUN=1] [FORCE=1]' '  make bundle-install-plugin [DEST=path]   Bundle, then install full plugin staging -> .agents/plugins' '                            [DRY_RUN=1] [FORCE=1]' '' 'Standalone .skill artifacts belong under .agents/skills; this facade does not install them.' 'Deprecated aliases: make install -> install-plugin; make install-plugin-local and install-local -> bundle-install-plugin.'

clean:
	bun run clean

test:
	bun run test

bundle:
	bun run bundle

release:
	bun run release -- $(if $(OUTPUT),--output "$(OUTPUT)",)

install-plugin:
	bun run install:plugin -- $(if $(SOURCE),--source "$(SOURCE)",) $(if $(DEST),--destination "$(DEST)",) $(if $(DRY_RUN),--dry-run,) $(if $(FORCE),--force,)

# Recursive calls in one recipe guarantee ordering, including under parallel Make.
# Clear SOURCE so this journey installs the freshly staged default.
bundle-install-plugin:
	+$(MAKE) bundle
	+$(MAKE) install-plugin SOURCE= $(if $(DEST),DEST="$(DEST)",) $(if $(DRY_RUN),DRY_RUN="$(DRY_RUN)",) $(if $(FORCE),FORCE="$(FORCE)",)

# Compatibility aliases intentionally delegate in recipes so warning and action stay ordered under -j.
install:
	@printf '%s\n' 'warning: make install is deprecated; use make install-plugin' >&2
	+$(MAKE) install-plugin

install-plugin-local:
	@printf '%s\n' 'warning: make install-plugin-local is deprecated; use make bundle-install-plugin' >&2
	+$(MAKE) bundle-install-plugin

install-local:
	@printf '%s\n' 'warning: make install-local is deprecated; use make bundle-install-plugin' >&2
	+$(MAKE) bundle-install-plugin

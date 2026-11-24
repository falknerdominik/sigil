# Node.js-only development environment for Sigil.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Chromium is optional for manual browser inspection, not required to build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*
ENV CHROME_BIN=/usr/bin/chromium

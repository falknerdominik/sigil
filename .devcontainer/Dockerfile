# Node.js and Quarto development environment for Sigil.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Chromium is optional for manual browser inspection, not required to build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*
ENV CHROME_BIN=/usr/bin/chromium

COPY .devcontainer/install-quarto.sh /tmp/install-quarto.sh
RUN sh /tmp/install-quarto.sh && rm /tmp/install-quarto.sh

# Deployment Specification

## Purpose

The product ships as a single-service Docker Compose deployment: one app container plus a SQLite database on a named volume. Postgres and a Caddy reverse proxy are present as commented, ready-to-enable services for the documented upgrade path.

## Requirements

### Requirement: Single-service compose deployment

`docker compose up` MUST start the app as one service, with the SQLite database on a named volume so data survives container recreation.

#### Scenario: Compose starts the app

- GIVEN the compose file at the repo root
- WHEN `docker compose up -d` runs
- THEN the app container starts
- AND the app is reachable on its documented port

#### Scenario: SQLite persists across restarts

- GIVEN a running app with created data
- WHEN the container is recreated with `docker compose up -d --force-recreate`
- THEN previously created data is still present

### Requirement: Ready-to-add Postgres and Caddy

The compose file MUST include commented `postgres` and `caddy` service definitions with guidance on enabling them, and MUST NOT require them for the MVP deployment.

#### Scenario: Base stack runs without the optional services

- GIVEN the default compose file
- WHEN `docker compose config --services` is run
- THEN the enabled service set contains only the app
- AND the postgres and caddy definitions are present but commented

### Requirement: Resource footprint envelope

The deployed app SHOULD operate within a 256–512MB memory envelope.

#### Scenario: Memory within envelope

- GIVEN the app running via compose
- WHEN container memory usage is sampled under normal load
- THEN usage stays within the documented 256–512MB range
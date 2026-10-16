# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-15

### Added

- **MCP server**: De GetApi API beschikbaar maken als MCP tools
- **Spec ophalen**: Automatisch ophalen van de OpenAPI spec van GetApi
- **Automatische updates**: Spec refresh elk uur met hash-vergelijking
- **Tool generatie**: Dynamische toolgenereering uit OpenAPI spec
- **x402 filtering**: Betaalbare AI-endpoints worden uitgesloten
- **Host-beperking**: Alle verzoeken beperkt tot `api.getapi.nl`
- **API-key authenticatie**: Via `X-Api-Key` header
- **Error handling**: Duidelijke foutcodes en -berichten aan het model
- **Logging**: Debug logging naar stderr

### Features

- **Vaste configuratie**:
  - Spec-URL: `https://api.getapi.nl/docs/api.json`
  - Basis-URL: `https://api.getapi.nl`
  - Authenticatieheader: `X-Api-Key`
  - Refresh-interval: 1 uur
  - Timeout: 10 seconden
  - Max response size: 1 MB
  - Max spec size: 5 MB

- **Tool naamgeving**:
  - Prefix: `getapi_`
  - Points in operationIds worden underscores: `operation.name` → `getapi_operation_name`

- **Parameter schema**:
  - Path parameters worden verplicht (ingevuld)
  - Query parameters als optioneel
  - Header parameters (behalve auth)
  - Body parameters als optioneel

- **Resultaten**:
  - Succesvolle responses als JSON tekst
  - Foutresponse met status code, message en details

### Technical Details

- **Node.js**: 20 LTS of nieuwer
- **TypeScript**: Gecompileerd naar JavaScript
- **Dependencies**:
  - @modelcontextprotocol/sdk - MCP server SDK
  - axios - HTTP client
  - zod - Schema validation
- **Logging**: Naar stderr, stdout vrij voor MCP protocol

### Security

- **API-key**: Slechts in `env`-sectie, nooit in logs of output
- **Host validation**: Alleen `api.getapi.nl` toegestaan
- **Spec validation**: OpenAPI validatie via Zod schema
- **x402 exclusie**: Betaalbare endpoints uitgesloten

### Tests

- **Unit tests**: toolnamen, parameter-schema's, spec-loading/validatie, HTTP-client
- **Integratietests**: lokale mock-server voor request/response, foutstatussen
- **End-to-end tests**: echte MCP-server via stdio, tool-registratie, JSON-RPC op stdout
- **Package smoke test**: het gepackagede npm-artefact installeren en draaien
- **Live contract test**: optioneel, met een `ga_test_`-key tegen de echte API

### Files

```
getapi-mcp/
├── README.md
├── CHANGELOG.md
├── package.json
├── src/
│   ├── index.ts          (MCP server start)
│   ├── bin.ts            (CLI entrypoint)
│   ├── auth.ts           (API key validatie)
│   ├── spec-loader.ts    (Spec ophalen, valideren, verversen)
│   ├── tool-builder.ts   (OpenAPI → MCP tools)
│   └── http-client.ts    (HTTP requests met host limiet)
├── test/
│   ├── fixtures/         (Spec fixtures)
│   ├── tool-builder.test.ts
│   ├── tool-builder-build.test.ts
│   ├── spec-loader.test.ts
│   ├── http-client.test.ts
│   ├── http-client.integration.test.ts
│   ├── server-startup.test.ts
│   └── e2e.test.ts
├── scripts/
│   ├── pack-smoke.mjs    (package smoke test)
│   ├── check-docs.mjs    (README/CHANGELOG consistentie)
│   └── live-contract.mjs (live API contract test)
└── .github/workflows/
    ├── ci.yml            (validatie op push/PR)
    └── release.yml       (validatie + npm publish)
```

### Open Issues

- x402 endpoint herkennen via x-pdok-x402 tags
- Volledige spec ophalen (gepaste spec?)
- Rate limits documenteren
- Publicatieverificatie voor MCP registry

---

**Previous versions**: none

[0.1.0]: https://github.com/GetApiNL/mcp-server/releases/tag/v0.1.0
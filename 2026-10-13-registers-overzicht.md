# Registers Overzicht - MCP & Payment

> Datum: 14 oktober 2026
> Status: Init (MCP register toe te voegen)

---

## Overzicht van alle registers

| Register | URL | Kosten | Aandeel | Status |
|----------|-----|-------|---------|--------|
| **MCP Registry** | https://registry.modelcontextprotocol.io | Gratis | Uitsluitend jou (GetApiNL org) | Initiating |
| **x402 Wallet Registry** | https://wallet.getapi.nl/ | Gratis | Uitsluitend jou | Live |
| **GetAPI.nl MCP Endpoint** | https://api.getapi.nl/api/mcp | Gratis | Uitsluitend jou | Live |

---

## 1. MCP Registry (registry.modelcontextprotocol.io)

### Metadata
- **Name:** `nl.getapi/nlgetapi-mcp`
- **Title:** GetAPI.nl MCP Server
- **Description:** Officiële GetAPI.nl MCP server voor lookup APIs (postcode, RDW, KVK, DNS, BTW, SBI, IP, energielabel, en meer).
- **Version:** 1.0.0
- **Website:** https://getapi.nl

### Kosten
- **Registratie:** Gratis
- **Hosting:** Self-hosted op getapi.nl (geen extra kosten)
- **API Usage:** Betaal via credits of x402 wallet

### Aandeel
- **Exclusief:** Ja (alleen jij, GetApiNL GitHub org)
- **MCP Clients:** Verbinden direct naar https://api.getapi.nl/api/mcp

### Repository
- **URL:** https://github.com/GetApiNL/getapi-mcp

### Authenticatie
- **Type:** Ed25519
- **Key:** `.well-known/mcp-registry-auth`
- **Endpoint:** GET /api/mcp-registry-auth (via /.well-known/mcp-registry-auth)

### Status
- **Manifest:** ✅ `server.json` ready
- **Auth key:** ✅ `.well-known/mcp-registry-auth` ready
- **GitHub repo:** ⏳ In aanmaak
- **Published:** ❌ Pending

### Stappen om te publiceren
1. MCP auth key genereren (Ed25519)
2. `.well-known/mcp-registry-auth` toevoegen aan repo root
3. Push naar `GetApiNL/getapi-mcp`
4. `mcp-publisher login http --domain=getapi.nl --private-key=<hex>`
5. `mcp-publisher publish`
6. Verifiëren op registry.modelcontextprotocol.io (zoeken op "getapi")

---

## 2. x402 Wallet Registry

### Metadata
- **Type:** Wallet payment protocol (EIP-712)
- **Network:** Base mainnet (eip155:8453)
- **Asset:** USDC (contract per facilitator)
- **Facilitator:** OpenX402 (default, swap via `cdp_format`)

### Kosten
- **Registratie:** Gratis
- **Transacties:** Pay-per-request via USDC

### Aandeel
- **Exclusief:** Nee (permissionless discovery via facilitator)

### Endpoint
- **Verify:** https://api.openx402.com/verify
- **Settle:** https://api.openx402.com/settle

### Config
- `config/x402.php`: network, asset, payTo (ontvangstadres), pricing
- `X402_ENABLED_ROUTES`: lijst van enabled routes
- `X402_PAY_TO`: eigan USDC wallet adres

### Status
- **MVP:** ✅ Live (pilot: lookup.postcode)
- **Enabled routes:** 1 (lookup.postcode)

---

## 3. GetAPI.nl MCP Endpoint

### Metadata
- **URL:** https://api.getapi.nl/api/mcp
- **Protocol:** JSON-RPC 2.0
- **Auth:** X-Api-Key header

### Kosten
- **Registratie:** Geen (eigen endpoint)
- **API Usage:** Betaal via credits of x402

### Aandeel
- **Exclusief:** Nee (open voor iedereen met valide credentials)

### Tools
- Dynamisch gegenereerd uit OpenAPI specs
- Cache: 60 seconden

### Status
- **Endpoint:** ✅ Live
- **Auth middleware:** ✅ Implemented
- **Tool generator:** ✅ Implemented

---

## Kostenverdeling

| Type | MCP Registry | x402 Registry | API Endpoint |
|------|--------------|---------------|--------------|
| Registratie | €0 | €0 | €0 |
| Hosting | €0 (self-hosted) | €0 | €0 |
| Per request | €0 | €0 (client paid) | Credits / USDC |
| Bandwidth | €0 | €0 | Variabel |
| Support | Eigen verantwoordelijkheid | Facilitator | Eigen verantwoordelijkheid |

### Totaal
- **MCP Registry:** Gratis (alleen registratiekosten bij provider, hier: 0)
- **x402:** Gratis registratie, transactiekosten door client
- **API Endpoint:** Gratis, usage betaald via credentials

---

## Roadmap

| Fase | Actie | Register | Status |
|------|-------|----------|--------|
| W0 | Init MCP repo | MCP Registry | ⏳ In uitvoering |
| W0 | Endpoint live | GetAPI.nl | ✅ Done |
| W1 | Monitor & logs | Alle | ✅ In uitvoering |
| W2 | x402 MVP | x402 Registry | ✅ Live |
| W3 | SEO updates | Geen | - |
| W4 | Marktplaats expandie | x402 + MCP | - |

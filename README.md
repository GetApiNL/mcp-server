# GetApi MCP Server

Een MCP-server die de GetApi-API beschikbaar maakt voor AI-clients zoals Claude Desktop.

## Installatie

Installeer de server via npm:

```bash
npm install -g getapi-mcp
```

## Wat het doet

Deze server maakt alle GetApi API-endpoints beschikbaar als tools voor AI-clients. De server communiceert via stdio en wordt gestart met `npx getapi-mcp`. De API-key wordt uitsluitend via de omgevingsvariabele `API_KEY` ingesteld.

## Vereisten

- Node.js 20 LTS of nieuwer
- Een actieve GetApi API-key

## Configuratie

### CLI gebruik

```bash
npx getapi-mcp
```

### MCP Server configuratie

Voeg de volgende configuratie toe aan de MCP-configuratie van je client (bijvoorbeeld `claude_desktop_config.json` voor Claude Desktop):

```json
{
  "mcpServers": {
    "getapi": {
      "command": "npx",
      "args": ["-y", "getapi-mcp@0.1.0"],
      "env": {
        "API_KEY": "ga_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

**Belangrijk**: De API-key wordt **alleen** via `env` ingesteld. De server redigeert de key volledig uit logs en output.

## API Key verkrijgen

Je moet een actieve API-key van [GetApi](https://getapi.nl/dashboard) hebben. Zie hun dashboard voor informatie over het aanmaken en beheren van keys.

**Opmerking**: De key moet het formaat `ga_live_xxxxx` of `ga_test_xxxxx` hebben.

## Beschikbare tools

De tool-lijst wordt automatisch gegenereerd uit de GetApi OpenAPI spec en wordt elk uur geüpdatet.

### Voorbeeld tools

| Tool | Omschrijving |
|------|-------------|
| `getapi_kadaster_bag_address` | Adres zoeken op postcode en huisnummer (BAG) |
| `getapi_kadaster_bag_address-suggest` | Adres-autocomplete suggesties |
| `getapi_kadaster_bag_id` | Adres zoeken op nummeraanduiding-ID |
| `getapi_lookup_postcode` | Postcode-lookup (NL) |
| `getapi_lookup_ip` | IP-/ISP-informatie |
| `getapi_validation_iban` | IBAN / BIC valideren |
| `getapi_validation_vat` | EU BTW-nummer valideren (VIES) |
| `getapi_property_pandgegevens` | Pandgegevens op postcode en huisnummer |
| `getapi_rdw_vehicle` | Voertuig op kenteken (RDW) |
| `getapi_lookup_dns_records` | DNS-records van een domein |
| ... | De volledige lijst wordt uit de OpenAPI spec gegenereerd |

Bekijk de [GetApi API-documentatie](https://getapi.nl/docs) voor de volledige lijst van endpoints.

## Gebruik

### Tool aanroepen

1. Klik op het MCP icoontje (meestal in de chat interface)
2. Voeg de GetApi server toe als een MCP server
3. Klik op een tool in het MCP paneel
4. Vul de vereiste parameters in
5. De tool wordt uitgevoerd en het resultaat wordt weergegeven

### Foutcodes

Als er een netwerkfout optreedt, krijg je een specifiek foutbericht:

| Code | Omschrijving | Oplossing |
|------|-------------|-----------|
| `404` | Resource niet gevonden | Check de URL en parameters |
| `400` | Fout bij parameters | Controleer de parameters op syntaxis |
| `422` | Validatiefout | Controleer de parameter types |
| `503` | Server tijdelijk niet beschikbaar | Probeer het later opnieuw |
| `TIMEOUT` | Request time-out | Verhoog de timeout |
| `401` | Ongeldige API key | Controleer je API key |

### Beveiliging

- De API-key wordt **nooit** in logs, output of tool-results weergegeven
- Alle verzoeken gaan alleen naar `https://api.getapi.nl`
- De server redacteert automatisch API-keys in logs
- Keys worden nooit naar GetApi verzonden

## Automatische updates

De server checkt elk uur of de GetApi spec is gewijzigd. Bij updates:

- De tool-lijst wordt automatisch bijgewerkt
- De client ontvangt een melding (afhankelijk van client-support)
- Ongeldige specs worden genegeerd met fallback op laatste goede versie

**Opmerking**: Niet alle MCP-clients verwerken automatische updates. Herstart je client als je nieuwe tools wilt zien.

## Bekende beperkingen

1. **x402 endpoints**: Betaalbare AI-endpoints worden niet beschikbaar gesteld (niet vereist voor AI-clients)
2. **Client support**: Herstart je client als de tool-lijst is gewijzigd
3. **Timeout**: Verzoeken hebben een time-out van 10 seconden
4. **Response size**: Maximaal 1 MB response
5. **Spec size**: OpenAPI spec mag maximaal 5 MB zijn

## Configuratie opties

Deze waarden zijn op dit moment vast in de server ingesteld (niet via env aanpasbaar); alleen `API_KEY` is een omgevingsvariabele.

| Optie | Default | Omschrijving |
|-------|--------|-------------|
| `specUrl` | `https://api.getapi.nl/docs/api.json` | URL naar de GetApi OpenAPI spec |
| `baseUrl` | `https://api.getapi.nl` | Base URL voor API verzoeken |
| `authHeader` | `X-Api-Key` | Header naam voor auth |
| `refreshIntervalMs` | `3600000` (1 uur) | Interval waarmee de spec wordt gecontroleerd |
| `timeoutMs` | `10000` | Request timeout (ms) |
| `maxResponseSize` | `1048576` | Max response size (1 MB) |
| `maxSpecSize` | `5242880` | Max spec size (5 MB) |
| `x402ExcludedOperations` | leeg | Operation-IDs die niet als tool worden geëxporteerd |

### Voorbeeld configuratie

De enige omgevingsvariabele is `API_KEY`:

```json
{
  "mcpServers": {
    "getapi": {
      "command": "npx",
      "args": ["-y", "getapi-mcp@0.1.0"],
      "env": {
        "API_KEY": "ga_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## Troubleshooting

### "API_KEY is niet ingesteld of ongeldig"

De server stopt met deze melding als `API_KEY` ontbreekt of niet met `ga_live_`/`ga_test_` begint. Stel de variabele in via je MCP client configuratie (zie Configuratie).

### "Geen spec beschikbaar"

- De spec-URL (`https://api.getapi.nl/docs/api.json`) is niet bereikbaar
- De GetApi spec is tijdelijk niet beschikbaar
- Check je internetverbinding

De server start in dat geval met alleen de `getapi_ping` fallback-tool en probeert het bij de volgende refresh opnieuw.

### "Parameter validation failed"

- Controleer de parameter namen en types tegen de `inputSchema` van de tool
- Verplichte parameters staan in `required`

### Fout met statuscode (bijv. 401/404)

- `401`: ongeldige of ontbrekende API-key
- `404`: verkeerde parameters of onbekend endpoint
- `503`/`504`: API tijdelijk niet beschikbaar of timeout

## Ontwikkelen & testen

```bash
# Afhankelijkheden installeren
npm install

# Alles valideren: typecheck + lint + build + tests (unit + e2e)
npm run validate

# Volledige check inclusief smoke-test van het gepackagede npm-artefact
npm run verify

# Alleen de tests
npm test

# Tests met coverage (en coverage-thresholds)
npm run test:coverage

# Documentatiecheck: links, ankers, versies en config-waarden
npm run check:docs

# Live contract test tegen de echte API (vereist API_KEY)
API_KEY=ga_test_... npm run test:live

# Smoke-test: pakt + installeert + start het echte pakket
npm run test:package

# Typecheck / lint afzonderlijk
npm run typecheck
npm run lint

# Bouwen naar dist/
npm run build
```

CI draait deze checks automatisch: `.github/workflows/ci.yml` op elke push/PR en `.github/workflows/release.yml` vóór publicatie.

### De server lokaal draaien

De server praat via stdio met een MCP-client. Voor een snelle handmatige controle kun je hem direct starten en hem JSON-RPC-berichten op stdin sturen:

```bash
# Start de server (met een geldige ga_live_/ga_test_ key)
API_KEY="ga_test_1234567890" node dist/bin.js
```

Stuur vervolgens bijvoorbeeld deze regel naar stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0.0"}}}
```

Alle logregels verschijnen op **stderr**; stdout bevat uitsluitend JSON-RPC. Zo zie je direct of de server correct opstart en welke tools beschikbaar zijn.

### Draaien in een MCP-client

Gebruik de configuratie onder [MCP Server configuratie](#mcp-server-configuratie). De client start de server zelf via stdio (`command: "npx"`) en geeft de API-key via `env` mee; er is geen poort of URL nodig.

## Versies

Zie de [CHANGELOG](CHANGELOG.md) voor een lijst van updates en verbeteringen.

## Licentie

MIT License - zie [LICENSE](LICENSE) voor details.

## Support

Voor vragen, bugs en suggesties, neem contact op via:
- Email: info@wdnoord.nl
- GitHub Issues: https://github.com/GetApiNL/mcp-server/issues

---

**Let op**: Deze server werkt alleen met een actieve GetApi API-key. Zonder geldige API-key werkt de server niet.

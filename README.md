# GetApi MCP Server

Eén endpoint met 33 tools voor Nederlandse overheids- en registerdata: KVK, BAG, WOZ, energielabel, kenteken, DSO, NDW en validatie.

De server draait hosted op `https://api.getapi.nl/mcp`. Installeren is niet nodig.

## Snel starten

Voeg dit toe aan de MCP-configuratie van je client (`claude_desktop_config.json`, `mcp.json` of vergelijkbaar):

```json
{
  "mcpServers": {
    "getapi": {
      "type": "http",
      "url": "https://api.getapi.nl/mcp",
      "headers": {
        "X-Api-Key": "ga_live_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

- Transport: streamable HTTP, protocolversie 2025-06-18
- `initialize` en `tools/list` antwoorden zonder sleutel, zodat je eerst kunt zien wat er is
- `tools/call` vraagt een sleutel en antwoordt zonder sleutel met 401

## Authenticatie

| Route | Header | Waarvoor |
|---|---|---|
| API-sleutel | `X-Api-Key: ga_live_...` | normaal gebruik |
| Bearer-token | `Authorization: Bearer ga_live_...` | clients die alleen Bearer ondersteunen |
| x402 | betaling per call vanuit een wallet | agent zonder account |

Een sleutel maak je aan in het [dashboard](https://getapi.nl/dashboard). Het formaat is `ga_live_...` of `ga_test_...`. Maak per client een eigen sleutel, dan zie je het verbruik apart terug.

## Kosten

De MCP-server is een dunne laag over dezelfde endpoints als de REST-API. Je verbruikt dezelfde credits per call en er is geen apart MCP-abonnement. Zonder sleutel kun je de tools bekijken, niet aanroepen.

## Tools

De lijst wordt gegenereerd uit de OpenAPI-specificatie van GetApi. Namespaces zijn gescheiden met punten.

### Adres, pand en energie

| Tool | Wat het doet |
|---|---|
| `kadaster.bag.address` | Adres op postcode en huisnummer (BAG) |
| `kadaster.bag.address.suggest` | Adres-suggesties voor autocomplete |
| `kadaster.bag.id` | Adres op nummeraanduiding-ID |
| `property.pandgegevens` | Pandgegevens, uitgebreid |
| `property.pandgegevens.lite` | Pandgegevens, licht |
| `property.woz.waarde` | WOZ-waarde |
| `property.energy.label` | Geregistreerd energielabel |
| `lookup.postcode` | Postcode-lookup |

### Bedrijven

| Tool | Wat het doet |
|---|---|
| `kvk.validate` | KVK-nummer geldig? |
| `kvk.search` | Bedrijven zoeken op naam of nummer |
| `kvk.detail` | KVK-detail: naam, adres, status |
| `cbs.sbi` | SBI-codetabel |
| `cbs.sbi.search` | SBI-codes zoeken op tekst |
| `cbs.sbi.detail` | SBI-code met titel en classificatiepad |

### Voertuigen en mobiliteit

| Tool | Wat het doet |
|---|---|
| `rdw.vehicle` | Voertuig op kenteken (uitgebreide respons) |
| `ndw.laadpunten` | Laadpunten in Nederland |
| `ndw.laadpunten.detail` | Laadpunt-detail (EVSE) |
| `ndw.emissiezones` | Milieuzones |
| `ndw.emissiezones.detail` | Milieuzone-detail |
| `ndw.truckparking` | Truckparkings |
| `ndw.truckparking.detail` | Truckparking-detail |

### Omgeving

| Tool | Wat het doet |
|---|---|
| `dso.plans` | Bestemmingsplannen (Wro) op locatie |
| `dso.documents` | Omgevingsdocumenten zoeken |

### Validatie en netwerk

| Tool | Wat het doet |
|---|---|
| `validation.email` | E-mailadres valideren (RFC en MX) |
| `validation.email.batch` | Tot 25 e-mailadressen per call |
| `validation.email.disposable` | Disposable-domeincheck |
| `validation.iban` | IBAN en BIC valideren, offline |
| `validation.vat` | Btw-nummer via VIES |
| `validation.dnsbl` | IP tegen vijf DNS-blacklists |
| `lookup.dns.nameservers` | Nameservers van een domein |
| `lookup.dns.records` | DNS-records per type |
| `lookup.ip` | IP-locatie en ISP |
| `scraping.email` | E-mailadressen uit HTML halen |

De actuele lijst vraag je op met `tools/list`. Dat mag zonder sleutel.

## Documentatie

- [MCP-koppeling](https://getapi.nl/mcp-server-integratie): koppelen, voorbeelden en veelgestelde vragen
- [API-documentatie](https://getapi.nl/docs/api): authenticatie, endpoints en codevoorbeelden
- [OpenAPI-specificatie](https://api.getapi.nl/docs/api.json): voor OpenWebUI, n8n en eigen tooling

## Registervermeldingen

- Officieel MCP-register: `nl.getapi/mcp`
- Glama connector: [nl.getapi/mcp](https://glama.ai/mcp/connectors/nl.getapi/mcp)
- Glama serverpagina: [GetApiNL/mcp-server](https://glama.ai/mcp/servers/GetApiNL/mcp-server)

## Lokaal draaien vanaf bron

Deze repository bevat ook een stdio-variant die de OpenAPI-specificatie elk uur opnieuw inleest. Die is bedoeld voor lokaal gebruik en voor eigen tooling.

```bash
npm install
npm run build
API_KEY="ga_live_..." node dist/bin.js
```

Verschillen met het hosted endpoint:

- Transport is stdio, geen URL en geen header. De sleutel gaat via de omgevingsvariabele `API_KEY`.
- Toolnamen krijgen een `getapi_`-prefix en punten worden underscores: `kadaster.bag.address` heet lokaal `getapi_kadaster_bag_address`.
- x402-endpoints worden niet als tool geëxporteerd.
- De sleutel wordt uit logs en tool-output geredigeerd en gaat alleen mee in de header naar `api.getapi.nl`.

Het npm-pakket `getapi-mcp` is **nog niet gepubliceerd**, dus `npx getapi-mcp` werkt voorlopig niet. Gebruik tot die tijd het hosted endpoint hierboven of de broncode.

### Configuratiewaarden

Deze staan vast in de server; alleen `API_KEY` is een omgevingsvariabele.

| Optie | Default | Omschrijving |
|---|---|---|
| `specUrl` | `https://api.getapi.nl/docs/api.json` | OpenAPI-specificatie |
| `baseUrl` | `https://api.getapi.nl` | Basis-URL voor API-verzoeken |
| `authHeader` | `X-Api-Key` | Headernaam voor auth |
| `refreshIntervalMs` | `3600000` | Interval voor de spec-check |
| `timeoutMs` | `10000` | Request-timeout |
| `maxResponseSize` | `1048576` | Maximale responsgrootte |
| `maxSpecSize` | `5242880` | Maximale specgrootte |
| `x402ExcludedOperations` | leeg | Operation-IDs die geen tool worden |

## Foutcodes

| Code | Oorzaak | Oplossing |
|---|---|---|
| `401` | Sleutel ontbreekt of is ongeldig | Sleutel in de header of in `API_KEY` |
| `400` | Fout in parameters | Parameters tegen de `inputSchema` leggen |
| `404` | Onbekend endpoint of verkeerde parameters | URL en parameters controleren |
| `422` | Validatiefout | Parametertypes controleren |
| `503` | API tijdelijk niet beschikbaar | Later opnieuw proberen |
| `TIMEOUT` | Request duurde te lang | Timeout verhogen |

## Ontwikkelen en testen

```bash
npm install

# Typecheck, lint, build en tests (unit en e2e)
npm run validate

# Alles, inclusief documentatiecheck en smoke-test van het npm-pakket
npm run verify

npm test                 # alleen de tests
npm run test:coverage    # met coverage-drempels
npm run check:docs       # links, ankers, versies en configuratiewaarden
npm run test:package     # pakt, installeert en start het echte pakket
API_KEY=ga_test_... npm run test:live   # contracttest tegen de echte API
```

CI draait deze checks op elke push en pull request (`.github/workflows/ci.yml`) en vóór publicatie (`.github/workflows/release.yml`).

Handmatig controleren van de stdio-server: start hem en stuur JSON-RPC op stdin.

```bash
API_KEY="ga_test_1234567890" node dist/bin.js
```

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1.0.0"}}}
```

Alle logregels gaan naar stderr; stdout bevat uitsluitend JSON-RPC.

## Licentie

MIT, zie [LICENSE](LICENSE).

## Support

- E-mail: info@wdnoord.nl
- Issues: https://github.com/GetApiNL/mcp-server/issues

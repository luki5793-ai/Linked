# LinkedIn & Xing Profile Search Scraper + EMAIL

Ein leistungsstarker Apify Actor, der LinkedIn- und Xing-Profile basierend auf Jobtiteln, Standort und Postleitzahl findet und extrahiert. Speziell optimiert für den deutschen B2B-Markt mit automatischer E-Mail- und Telefonnummern-Recherche.

## Features

- **Multi-Platform-Suche**: Durchsucht sowohl LinkedIn als auch Xing
- **Intelligente PLZ-Filterung**: Präzise Filterung nach Postleitzahl-Präfixen
- **Automatisches E-Mail-Enrichment**: Findet E-Mail-Adressen über:
  - Unternehmenswebsites
  - Impressum-Seiten
  - Pattern-Generierung
- **Telefonnummern-Recherche**: Extrahiert Telefonnummern aus öffentlichen Quellen
- **Firmen-Daten-Anreicherung**: Sammelt zusätzliche Unternehmensinformationen
- **Duplikatserkennung**: Intelligente Erkennung und Zusammenführung von Duplikaten
- **Keine Cookies erforderlich**: Nutzt öffentlich zugängliche Daten
- **Proxy-Rotation**: Verwendet Apify Residential Proxies zur Vermeidung von Blockierungen
- **DSGVO-konform**: Sammelt nur öffentlich verfügbare Informationen

## Anwendungsfälle

### Recruiting
Finden Sie IT-Fachkräfte, Führungskräfte oder Spezialisten in spezifischen Regionen:
- "DevOps Engineer in München"
- "HR Manager im Raum Köln"
- "CTO in Berlin"

### B2B Sales & Lead-Generierung
Identifizieren Sie Entscheider und Key-Accounts:
- "Geschäftsführer in Hamburg"
- "IT-Leiter in Frankfurt"
- "Einkaufsleiter in Stuttgart"

### Market Research
Analysieren Sie Märkte und Wettbewerber:
- Identifikation von Branchenexperten
- Marktanalyse nach Regionen
- Competitive Intelligence

## Input-Parameter

### Erforderliche Parameter

#### `jobTitles` (Array)
Liste der gesuchten Jobtitel.

**Beispiele:**
```json
["IT Manager", "Personalleiter", "DevOps Engineer", "CTO", "Geschäftsführer"]
```

#### `location` (String)
Stadt oder Region für die Suche.

**Beispiele:**
```json
"Köln"
"München"
"Berlin"
"Hamburg"
```

#### `postalCodePrefix` (String)
Postleitzahl-Präfix zum Filtern.

**Beispiele:**
```json
"5"     // Sucht alle PLZ von 50000-59999
"50"    // Sucht alle PLZ von 50000-50999
"501"   // Sucht alle PLZ von 50100-50199
```

### Optionale Parameter

#### `platforms` (String)
Welche Plattformen durchsucht werden sollen.

**Optionen:** `"linkedin"`, `"xing"`, `"both"`
**Default:** `"both"`

#### `maxResultsPerPlatform` (Integer)
Maximale Anzahl der Profile pro Jobtitel und Plattform.

**Default:** `50`
**Range:** `1-500`

#### `enableEmailEnrichment` (Boolean)
E-Mail-Adressen automatisch recherchieren.

**Default:** `true`

#### `enablePhoneEnrichment` (Boolean)
Telefonnummern recherchieren.

**Default:** `true`

#### `enableCompanyEnrichment` (Boolean)
Zusätzliche Firmeninformationen sammeln.

**Default:** `true`

#### `deduplicateProfiles` (Boolean)
Duplikate über beide Plattformen hinweg entfernen.

**Default:** `true`

#### `proxyConfiguration` (Object)
Apify Proxy-Konfiguration.

**Default:**
```json
{
  "useApifyProxy": true,
  "apifyProxyGroups": ["RESIDENTIAL"]
}
```

## Input-Beispiel

```json
{
  "jobTitles": [
    "IT Manager",
    "CTO",
    "Head of IT"
  ],
  "location": "Köln",
  "postalCodePrefix": "5",
  "platforms": "both",
  "maxResultsPerPlatform": 50,
  "enableEmailEnrichment": true,
  "enablePhoneEnrichment": true,
  "enableCompanyEnrichment": true,
  "deduplicateProfiles": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

## Output-Format

Jedes Profil wird mit folgenden Daten exportiert:

```json
{
  "fullName": "Max Mustermann",
  "jobTitle": "IT Manager",
  "currentCompany": "Beispiel GmbH",
  "companyWebsite": "https://www.beispiel.de",
  "companyIndustry": "Informationstechnologie",
  "companySize": "51-200 Mitarbeiter",
  "location": "Köln, Nordrhein-Westfalen",
  "postalCode": "50667",
  "country": "Deutschland",

  "contactInfo": {
    "email": "max.mustermann@beispiel.de",
    "emailConfidence": "high",
    "phone": "+49 221 12345678",
    "phoneType": "personal",
    "linkedinUrl": "https://www.linkedin.com/in/max-mustermann",
    "xingUrl": "https://www.xing.com/profile/Max_Mustermann",
    "companyPhone": "+49 221 12345600"
  },

  "professionalInfo": {
    "aboutSummary": "Erfahrener IT-Manager mit 10+ Jahren Erfahrung...",
    "yearsOfExperience": 10,
    "currentPosition": {
      "title": "IT Manager",
      "company": "Beispiel GmbH",
      "startDate": "Jan 2020",
      "current": true,
      "description": "Leitung der IT-Abteilung..."
    },
    "previousPositions": [
      {
        "title": "Senior Developer",
        "company": "Andere GmbH",
        "duration": "Jan 2015 - Dez 2019"
      }
    ],
    "education": [
      {
        "degree": "Master of Science",
        "field": "Informatik",
        "school": "Universität zu Köln",
        "year": "2015-2017"
      }
    ],
    "skills": [
      "JavaScript",
      "Team Leadership",
      "Project Management"
    ],
    "languages": [
      "Deutsch (Muttersprache)",
      "Englisch (Fließend)"
    ]
  },

  "metadata": {
    "profileImageUrl": "https://...",
    "scrapedAt": "2025-11-16T10:30:00Z",
    "scrapedFrom": "linkedin",
    "searchQuery": "IT Manager Köln",
    "dataQuality": "high",
    "enrichmentSources": [
      "linkedin",
      "company_website",
      "impressum"
    ]
  }
}
```

## Xing vs. LinkedIn

### Xing-Vorteile für den deutschen Markt

Xing ist besonders wertvoll für B2B-Recherche im DACH-Raum:

- **Höhere Profilqualität** in Deutschland, Österreich, Schweiz
- **Vollständigere Kontaktdaten** - Xing-Nutzer teilen öfter E-Mails und Telefonnummern
- **Weniger restriktiv** - Mehr öffentlich zugängliche Daten als LinkedIn
- **Bessere Erreichbarkeit** - Kontaktinformationen oft direkt im Profil

### Empfehlung

Für beste Ergebnisse im deutschen Markt:
- Verwenden Sie `"platforms": "both"` um beide Plattformen zu nutzen
- Xing liefert oft direktere Kontaktdaten (E-Mail, Telefon)
- LinkedIn bietet größere Reichweite, besonders bei internationalen Unternehmen

## E-Mail-Enrichment-Strategie

Der Actor verwendet eine mehrstufige Strategie zur E-Mail-Findung:

### 1. Direkt aus Profil (Confidence: HIGH)
- E-Mail direkt vom Xing-Profil (häufig verfügbar)
- E-Mail vom LinkedIn-Profil (selten öffentlich)

### 2. Unternehmenswebsite (Confidence: HIGH)
- Suche auf der Firmen-Homepage
- Team-Seiten durchsuchen
- Impressum-Seiten analysieren

### 3. Pattern-Generierung (Confidence: LOW)
Generiert typische deutsche E-Mail-Muster:
- `vorname.nachname@firma.de`
- `v.nachname@firma.de`
- `vorname@firma.de`

### E-Mail-Confidence-Levels

- **HIGH**: E-Mail wurde direkt gefunden und verifiziert
- **MEDIUM**: E-Mail über Pattern mit Validation gefunden
- **LOW**: E-Mail generiert, aber nicht verifiziert

## Kosten & Performance

### Geschätzte Kosten

Bei Verwendung von Apify Residential Proxies:

- **Pro Profil**: ~$0.02 - $0.05
- **50 Profile**: ~$1 - $2.50
- **100 Profile**: ~$2 - $5

**Kostenfaktoren:**
- Proxy-Nutzung (Residential Proxies empfohlen)
- E-Mail/Phone-Enrichment (zusätzliche Requests)
- Company-Enrichment (Website-Scraping)

### Performance

- **Durchsatz**: ~5-10 Profile pro Minute
- **50 Profile**: ~5-10 Minuten
- **100 Profile**: ~10-20 Minuten

**Geschwindigkeit wird beeinflusst durch:**
- Anzahl der Enrichment-Optionen
- Proxy-Geschwindigkeit
- Website-Ladezeiten

## Limitierungen

### Technische Limitierungen

1. **Öffentliche Daten**: Nur öffentlich zugängliche Profile werden gefunden
2. **Rate Limiting**: Verzögerungen zwischen Requests zur Vermeidung von Blockierungen
3. **E-Mail-Verfügbarkeit**: E-Mails können nicht für alle Profile gefunden werden
4. **Proxy-Abhängigkeit**: Residential Proxies empfohlen für beste Ergebnisse

### Plattform-spezifisch

**LinkedIn:**
- Begrenzte öffentliche Daten ohne Login
- Anti-Scraping-Maßnahmen
- Weniger Kontaktinformationen öffentlich

**Xing:**
- Hauptsächlich DACH-Region
- Kleinere Nutzerbasis als LinkedIn
- Besser für deutsche B2B-Kontakte

## Best Practices

### 1. Suchoptimierung

**Präzise Jobtitel verwenden:**
```json
// Gut
["IT Manager", "IT-Leiter", "Leiter IT"]

// Zu allgemein
["Manager"]
```

**Spezifische PLZ-Präfixe:**
```json
// Genau
"50"  // Köln Innenstadt (50xxx)

// Weniger präzise
"5"   // Gesamter Raum 50xxx-59xxx
```

### 2. Enrichment-Balance

Für schnellere Ergebnisse:
```json
{
  "enableEmailEnrichment": true,
  "enablePhoneEnrichment": false,
  "enableCompanyEnrichment": false
}
```

Für maximale Datenqualität:
```json
{
  "enableEmailEnrichment": true,
  "enablePhoneEnrichment": true,
  "enableCompanyEnrichment": true
}
```

### 3. Plattform-Auswahl

**Nur Xing** (schneller, mehr Kontaktdaten):
```json
{
  "platforms": "xing",
  "maxResultsPerPlatform": 100
}
```

**Beide Plattformen** (maximale Abdeckung):
```json
{
  "platforms": "both",
  "maxResultsPerPlatform": 50
}
```

### 4. Kostenoptimierung

- **Starten Sie mit kleinen Tests** (maxResultsPerPlatform: 10)
- **Deaktivieren Sie nicht benötigte Enrichments**
- **Nutzen Sie spezifische PLZ-Präfixe** für gezielte Suchen

## Rechtliche Hinweise & DSGVO

### Datensammlung

Dieser Actor sammelt **ausschließlich öffentlich zugängliche Daten**:
- Keine Login-Informationen erforderlich
- Keine Umgehung von Zugangsbeschränkungen
- Nur Daten, die auch ohne Account sichtbar sind

### DSGVO-Compliance

**Beachten Sie bei der Nutzung:**

1. **Rechtmäßige Verarbeitung**: Stellen Sie sicher, dass Sie eine Rechtsgrundlage für die Datenverarbeitung haben (z.B. berechtigtes Interesse für B2B-Kontaktaufnahme)

2. **Transparenz**: Informieren Sie betroffene Personen über die Datenverarbeitung bei Kontaktaufnahme

3. **Datensparsamkeit**: Sammeln Sie nur die tatsächlich benötigten Informationen

4. **Speicherdauer**: Löschen Sie Daten, die nicht mehr benötigt werden

5. **Betroffenenrechte**: Implementieren Sie Prozesse für Auskunft, Löschung, etc.

### Empfohlene Nutzung

**Erlaubte Nutzung:**
- B2B-Kontaktaufnahme für geschäftliche Zwecke
- Recruiting im beruflichen Kontext
- Marktforschung und Competitive Intelligence
- Lead-Generierung für B2B-Produkte/Services

**Nicht empfohlen:**
- Massen-Spam-E-Mails
- Verkauf von Kontaktdaten
- B2C-Marketing ohne Einwilligung

**Hinweis:** Konsultieren Sie einen Rechtsanwalt für spezifische rechtliche Beratung bezüglich Ihrer Nutzung.

## Fehlerbehandlung

Der Actor implementiert robuste Fehlerbehandlung:

- **Automatische Retries**: Bei temporären Fehlern
- **Proxy-Rotation**: Bei Blockierungen
- **Graceful Degradation**: Partial Results bei Fehlern
- **Detailliertes Logging**: Für Debugging

## Support & Feedback

Bei Fragen oder Problemen:

1. Prüfen Sie die Logs im Apify Dashboard
2. Kontaktieren Sie den Support über Apify
3. Melden Sie Bugs oder Feature-Requests

## Changelog

### Version 1.0.0 (2025-11-16)
- Initiale Veröffentlichung
- LinkedIn & Xing Profile Scraping
- E-Mail & Telefon Enrichment
- Firmen-Daten-Anreicherung
- PLZ-Filterung
- Duplikatserkennung

## Lizenz

Apache 2.0

---

**Entwickelt für den deutschen B2B-Markt** | **Optimiert für Recruitment & Lead-Generierung** | **DSGVO-konform**

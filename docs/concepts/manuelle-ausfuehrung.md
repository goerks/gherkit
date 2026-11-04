# Manuelle Ausführung: Führung, Testinformationen, Jira und Xray

Konzept mit Varianten. Es ergänzt den [ADR 0009](../adr/0009-manual-and-hybrid-execution.md) und die
[Anleitung](../manual-testing.md). Stand: 2026-11-04. Die Teile, die schon umgesetzt sind, stehen in Abschnitt 1; die
drei offenen Teile mit Varianten und Empfehlung in Abschnitt 3 bis 5; was ich von dir brauche, in Abschnitt 6.

## 1. Was die Rückmeldung verlangt hat und wo es steht

| Wunsch | Stand |
| --- | --- |
| Pakete der Reihe nach: Feature für Feature, Szenario für Szenario, Schritt für Schritt | umgesetzt (Variante A1) |
| Nach «gut» oder «schlecht» geht es weiter, der Fortschritt ist sichtbar | umgesetzt: nächster Schritt, Gliederung mit Zustand, Fortschrittsbalken |
| Mehr Führung | Grundlage umgesetzt, Ausbau offen (Abschnitt 3) |
| Zusätzliche Testinformationen bei einem Schritt | Freitext umgesetzt (B1), strukturierte Felder offen (Abschnitt 4) |
| Übersicht über die Testresultate | umgesetzt: Kennzahlen, Liste je Feature mit Begründung und Nachweis |
| Nachweis direkt im Schritt | umgesetzt: Datei oder Screenshot mit Strg+V |
| «Blockiert» hinterfragen, Begründung zwingend | umgesetzt (Abschnitt 2) |
| Jira-Issue aus einem fehlgeschlagenen Test | Text umgesetzt (C0), Weiterführung offen (Abschnitt 5) |
| Anderes Beispiel | umgesetzt: Bibliothek (suchen, reservieren, verlängern) |

## 2. «Blockiert» wird «Ignorieren», mit Pflichtbegründung

Du hast recht: «blockiert» und «bewusst nicht beurteilt» sind für das Ergebnis dasselbe, nämlich *nicht beurteilt*. Sie
unterscheiden sich nur im Grund (Testsystem fällt aus, Voraussetzung fehlt, nicht relevant für diesen Build). Den Grund
liefert die Begründung. Darum gibt es nur noch drei Antworten:

* **Gut** (bestanden), Kommentar freiwillig
* **Schlecht** (fehlgeschlagen), Begründung Pflicht: beobachtetes Verhalten
* **Ignorieren** (übersprungen), Begründung Pflicht

Die Regel wird vom Server erzwungen, nicht nur von der Oberfläche. Im Ergebnis ist «ignoriert» ein `skipped` mit der
Begründung als Meldung. Für Xray ist das später eindeutig abbildbar (Abschnitt 5).

## 3. Führung: wie weit soll der Ablauf gehen?

Heute: Die Ansicht zeigt den aktuellen Schritt hervorgehoben, nach jeder Antwort rückt sie zum nächsten Schritt vor, nach
einem Fehler oder «ignoriert» zum nächsten Szenario. Links steht die Gliederung. Offen ist, wie stark der Ablauf führen
und einschränken soll.

| | A1 Liste mit Fokus (heute) | A2 Assistent, ein Schritt pro Bildschirm | A3 Geführt mit Regeln |
| --- | --- | --- | --- |
| Idee | Ganzes Szenario sichtbar, der aktuelle Schritt ist gross | Nur der aktuelle Schritt, grosse Knöpfe, Tastatur (G, S, I) | Wie A1 oder A2, plus Regeln pro Schritt aus dem Feature |
| Überblick | gut: man sieht, was vorher und nachher kommt | schwach: Kontext fehlt | gut |
| Tempo | mittel, Maus | hoch, Tastatur | mittel |
| Aufwand | umgesetzt | klein (Ansicht nur umschalten) | gross: Regeln müssen irgendwo definiert werden (z. B. «Schritt braucht Nachweis», «Wert erfassen») |
| Risiko | Man springt zu leicht herum | Falsche Antwort, weil der Kontext fehlt | Regeln verteilen sich auf Feature und Konfiguration |

Fragen dazu, die sich auf Gestaltung auswirken:

* Soll ein Lauf Szenarien in der Reihenfolge der Dateien erzwingen, oder darf man frei springen? (Heute: frei, aber es
  geht automatisch weiter.)
* Soll es eine Pause geben (Lauf unterbrechen, später fortsetzen)? Technisch geht das schon, der Zustand liegt in Dateien.
* Mehrere Testende an einem Lauf (z. B. je ein Feature)? Heute nein; es bräuchte eine Zuordnung und eine Sperre.
* Soll die Zeit je Schritt oder Szenario erfasst werden (für Aufwandsschätzung und Auditspur)?

**Empfehlung:** A1 behalten und A2 als Tastatur-Modus darauf setzen (Taste G, S, I; Pfeile für Navigation). Das gibt
Tempo für Geübte, ohne den Überblick zu verlieren. A3 erst, wenn ein Pilotprojekt Regeln wirklich braucht.

## 4. Zusätzliche Testinformationen bei manuellen Schritten

Heute: Jeder Schritt hat ein Freitextfeld («Testinformationen / Beobachtung») und Nachweise. Das geht in den Bericht und
in den Jira-Text. Der Nachteil von Freitext: Er lässt sich nicht auswerten, und man vergisst Angaben (Browser, Gerät,
gemessener Wert).

| | B1 Freitext (heute) | B2 Felder im Feature | B3 Katalog für manuelle Schritte | B4 Vorlage je Umgebung |
| --- | --- | --- | --- | --- |
| Idee | Ein Kommentarfeld | Der Schritt trägt Felder, die erfasst werden, z. B. eine Tabelle `\| erfassen \| Gerät \| Browser \|` im Schritt | Eine Datei beschreibt je Schrittmuster die Felder (Typ, Pflicht, Auswahl), z. B. «Rückgabedatum sichtbar» braucht einen Nachweis | Beim Start des Laufs werden Umgebungsfelder einmal erfasst (Gerät, Browser, Rolle) und gelten für alle Schritte |
| Gherkin bleibt lesbar | ja | mässig: Tabellen mit anderer Bedeutung als Testdaten | ja | ja |
| Auswertbar | nein | ja | ja | ja (Lauf-Ebene) |
| Wiederverwendbar über Features | – | nein, je Schritt | ja | ja |
| Aufwand | umgesetzt | mittel | mittel bis gross | klein |
| Risiko | Angaben fehlen | Vermischt Testdaten mit Erfassungsfeldern | Eine zweite Datei neben dem Feature, passt zum geplanten Step-Katalog (M1) | deckt nur Umgebung ab |

**Empfehlung:** B1 jetzt behalten und mit **B4** ergänzen (klein, sofort nützlich: Gerät, Browser, Rolle einmal pro Lauf,
steht dann im Bericht und im Jira-Text). B3 weiterverfolgen, sobald der Step-Katalog aus dem Runner kommt, weil dieselbe
Datei beides tragen kann. B2 würde ich vermeiden.

## 5. Jira und Xray

Heute (C0): Für einen fehlgeschlagenen Test erzeugt gherkit Zusammenfassung und Beschreibung im Jira-Wiki-Format. Die
Beschreibung enthält: beobachtetes Verhalten, Feature, Szenario mit Datei und Zeile, Beispielwerte, Xray-Test (Tag
`@TEST_PROJ-123`), Schritte bis zum Fehler mit Testinformationen, Testdaten, Nachweis-Dateien, Testlauf mit Person,
Umgebung und Build. Man kopiert den Text in ein neues Ticket.

| | C0 Text kopieren (heute) | C1 Ticket-Link mit Vorbelegung | C2 Ticket direkt anlegen | C3 Ergebnis nach Xray |
| --- | --- | --- | --- | --- |
| Idee | Dialog mit Kopierknöpfen | Ein Knopf öffnet «Vorgang erstellen» in Jira mit Projekt, Typ, Zusammenfassung und Beschreibung ausgefüllt | gherkit legt den Bug über die Jira-Schnittstelle an, hängt die Nachweise an und verlinkt den Test | gherkit lädt den Lauf als Test Execution nach Xray, fehlgeschlagene Schritte mit dem Bug als Defect |
| Zugang nötig | nein | nein (Browser ist angemeldet) | ja: Zugangstoken, Projekt, Vorgangstyp | ja: Token, Xray-Version |
| Nachweise | von Hand anhängen | von Hand anhängen | automatisch | automatisch (Xray nimmt Nachweise im Ergebnis) |
| Rückführung zum Test | Test im Text genannt | Test im Text genannt | Link «Test → Bug» | Test Execution, Defect, Test verknüpft |
| Funktioniert auf der Demo-Seite | ja | ja | nein (Browser darf Jira nicht direkt aufrufen) | nein |
| Aufwand | umgesetzt | klein | mittel | gross |
| Voraussetzung | – | Projekt- und Typ-Kennung, einmal konfiguriert | Zugriffskonzept (Token, Netz) | Test-Schlüssel an den Szenarien, Xray-Version |

Zu C3: Für manuelle Ergebnisse passt das Xray-eigene JSON-Format besser als Cucumber JSON, weil es Defects, Kommentare und
Nachweise je Test und Schritt trägt. Der Export ist eine kleine Umwandlung des vorhandenen Laufs. Zuordnung der
Antworten: gut → PASS, schlecht → FAIL, ignoriert → TODO oder ABORTED (zu klären). Die Details sind gegen die Version
des Kunden zu prüfen (Jira und Xray Data Center).

**Empfehlung:** C0 behalten, **C1** als nächsten Schritt (ohne Zugang, wirkt sofort). C2 und C3 erst nach der Klärung der
Fragen unten, denn sie hängen an Zugangsdaten und Version. Die Test-Schlüssel (`@TEST_PROJ-123`) kann man schon jetzt
an die Szenarien schreiben; sie schaden nicht und sind die Brücke zu Xray.

## 6. Was ich von dir brauche

1. **Führung:** Reicht A1 mit Tastatur-Modus, oder willst du A2 als eigenen Assistenten? Frei springen erlaubt?
2. **Testinformationen:** Welche Angaben sollen je Lauf feststehen (B4: Gerät, Browser, Rolle, Umgebung)? Gibt es Schritte,
   bei denen ein Wert zwingend erfasst werden muss (B3)?
3. **Jira:** Jira Data Center, welche Version? Projekt und Vorgangstyp für Bugs? Wie wird angemeldet (Token)?
4. **Xray:** Version, und gelten Tags wie `@TEST_PROJ-123` an den Szenarien (oder eine andere Zuordnung)?
5. **«Ignoriert» in Xray:** TODO (nochmals ansetzen) oder ABORTED (abgebrochen)?

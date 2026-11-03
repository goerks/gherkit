# language: de
@vergleich
Funktionalität: Prämienvergleich im Vergleichsportal
  Als Interessent möchte ich die Prämien mehrerer Anbieter vergleichen,
  damit ich das günstigste passende Angebot finde.

  Das Portal liegt hinter einem Captcha und zeigt tagesaktuelle Preise.
  Berechnung und Datenqualität prüft die Automatisierung über die Schnittstelle.
  Sortierung, Lesbarkeit und der Wechsel zum Anbieter beurteilt eine Person
  im Browser (@manual).

  Grundlage:
    Angenommen das Vergleichsportal ist erreichbar

  @api
  Szenario: Die Berechnung liefert plausible Jahresprämien
    Wenn ich die Prämien für eine 35-jährige Person im Kanton Zürich abfrage
    Dann enthält jedes Angebot eine Jahresprämie zwischen 500 und 8000 Franken
    Und kein Anbieter erscheint doppelt

  @api
  Szenario: Eine unbekannte Postleitzahl liefert keine Angebote
    Wenn ich die Prämien für die Postleitzahl "0000" abfrage
    Dann erhalte ich die Meldung "Keine Angebote gefunden"

  @manual
  Szenariogrundriss: Die Trefferliste ist sortiert und gut lesbar
    Angenommen ich habe das Captcha des Portals gelöst
    Wenn ich im Kanton "<kanton>" nach einer "<sparte>" suche
    Dann sind die Angebote nach Jahresprämie aufsteigend sortiert
    Und jedes Angebot zeigt Anbieter, Prämie und Leistungsumfang gut lesbar an
    Und die Seite ist auf dem Smartphone bedienbar

    Beispiele:
      | kanton | sparte                    |
      | Zürich | Krankenzusatzversicherung |
      | Bern   | Hausratversicherung       |

  @manual
  Szenario: Der Wechsel zum Anbieter führt auf die richtige Seite
    Angenommen ich habe das Captcha des Portals gelöst
    Und ich sehe die Angebote für eine Hausratversicherung im Kanton Bern
    Wenn ich bei den folgenden Anbietern auf "Zum Angebot" klicke:
      | anbieter | erwartete Domain |
      | Alpina   | alpina.example   |
      | Helvetia | helvetia.example |
    Dann öffnet sich jeweils die Seite des Anbieters
    Und das gewählte Produkt ist bereits vorausgewählt

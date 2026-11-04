# language: de
@bibliothek
Funktionalität: Katalogsuche
  Als Leserin möchte ich Bücher online suchen,
  damit ich weiss, ob und wo sie verfügbar sind.

  Die Suche selbst prüft die Automatisierung über die Schnittstelle (@api).
  Ob die Trefferliste verständlich und gut lesbar ist, beurteilt eine Person
  im Browser (@manual).

  Grundlage:
    Angenommen der Katalog enthält folgende Bücher:
      | titel           | autor         | verfügbar |
      | Die Verwandlung | Franz Kafka   | 3         |
      | Der Prozess     | Franz Kafka   | 1         |
      | Heidi           | Johanna Spyri | 0         |

  @api
  Szenario: Die Suche nach einem Titel findet das Buch
    Wenn ich nach "Verwandlung" suche
    Dann finde ich "Die Verwandlung" von "Franz Kafka"
    Und es sind 3 Exemplare verfügbar

  @api
  Szenario: Die Suche nach einem Autor findet alle seine Bücher
    Wenn ich nach "Kafka" suche
    Dann finde ich 2 Bücher

  @api
  Szenario: Eine Suche ohne Treffer wird erklärt
    Wenn ich nach "Zauberberg" suche
    Dann erhalte ich die Meldung "Keine Bücher gefunden"

  @manual
  Szenariogrundriss: Die Trefferliste ist verständlich
    Angenommen ich öffne den Katalog auf dem Gerät "<gerät>"
    Wenn ich nach "<suchbegriff>" suche
    Dann zeigt jeder Treffer Titel, Autor und Verfügbarkeit gut lesbar an
    Und ausgeliehene Bücher nennen das Rückgabedatum
    Und ein verfügbares Buch lässt sich direkt reservieren

    Beispiele:
      | gerät      | suchbegriff |
      | Computer   | Kafka       |
      | Smartphone | Heidi       |

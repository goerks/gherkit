# language: de
@cli @i18n
Funktionalität: Mehrsprachigkeit
  gherkit unterstützt alle Sprachen der offiziellen Gherkin-Spezifikation.
  Diese Spezifikation ist selbst auf Deutsch geschrieben.

  Szenario: Deutsche Features werden erkannt und geprüft
    Angenommen eine Datei "anmeldung.feature" mit:
      """gherkin
      # language: de
      Funktionalität: Anmeldung

        Szenario: Erfolgreich
          Angenommen eine registrierte Kundin
          Wenn sie sich anmeldet
          Dann sieht sie ihre Bestellungen
      """
    Wenn ich "gherkit lint ." ausführe
    Dann ist der Exit-Code 0

  Szenario: Die Schlüsselwörter einer Sprache anzeigen
    Wenn ich "gherkit dialects de" ausführe
    Dann enthält die Ausgabe "Funktionalität"
    Und enthält die Ausgabe "Angenommen"

# language: de
@bibliothek
Funktionalität: Reservation
  Als Leserin möchte ich ein ausgeliehenes Buch reservieren,
  damit ich es bekomme, sobald es zurück ist.

  Grundlage:
    Angenommen der Katalog enthält folgende Bücher:
      | titel           | autor         | verfügbar |
      | Die Verwandlung | Franz Kafka   | 3         |
      | Heidi           | Johanna Spyri | 0         |
    Und die Leserin "Anna" ist angemeldet

  @api
  Szenario: Ein ausgeliehenes Buch kann reserviert werden
    Wenn ich "Heidi" reserviere
    Dann ist "Heidi" für mich reserviert
    Und ich bin an Stelle 1 der Warteliste

  @api
  Szenario: Ein verfügbares Buch braucht keine Reservation
    Wenn ich "Die Verwandlung" reserviere
    Dann erhalte ich die Meldung "Das Buch ist verfügbar, bitte ausleihen"

  @api
  Szenario: Mehr als 5 Reservationen sind nicht möglich
    Angenommen ich habe 5 Reservationen
    Wenn ich "Heidi" reserviere
    Dann erhalte ich die Meldung "Maximal 5 Reservationen"

  @manual
  Szenario: Die Bestätigung kommt per E-Mail
    Wenn ich "Heidi" reserviere
    Dann erhalte ich innerhalb von 5 Minuten eine E-Mail
    Und die E-Mail nennt Titel, Warteposition und Abholort
    Und der Link in der E-Mail führt in mein Kundenkonto

  @manual
  Szenario: Die Abholbenachrichtigung kommt, wenn das Buch bereit ist
    Angenommen ich habe "Heidi" reserviert
    Wenn das Buch zurückgegeben wird
    Dann erhalte ich eine Abholbenachrichtigung
    Und das Buch liegt sieben Tage für mich bereit

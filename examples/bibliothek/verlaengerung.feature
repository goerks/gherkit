# language: de
@bibliothek
Funktionalität: Verlängerung
  Als Leserin möchte ich die Leihfrist eines Buches verlängern,
  damit ich es in Ruhe fertig lesen kann.

  Grundlage:
    Angenommen die Leserin "Anna" ist angemeldet

  @api
  Szenario: Eine Ausleihe wird um 14 Tage verlängert
    Angenommen ich habe "Die Verwandlung" bis zum 10.11.2026 ausgeliehen
    Wenn ich die Ausleihe verlängere
    Dann ist die Leihfrist bis zum 24.11.2026

  @api
  Szenario: Ein vorgemerktes Buch kann nicht verlängert werden
    Angenommen ich habe "Heidi" bis zum 10.11.2026 ausgeliehen
    Und "Heidi" ist von einer anderen Leserin vorgemerkt
    Wenn ich die Ausleihe verlängere
    Dann erhalte ich die Meldung "Das Buch ist vorgemerkt"
    Und die Leihfrist bleibt bis zum 10.11.2026

  @manual
  Szenario: Das Kundenkonto zeigt die Leihfristen verständlich
    Angenommen ich habe mehrere Bücher ausgeliehen
    Wenn ich im Kundenkonto "Meine Ausleihen" öffne
    Dann sehe ich zu jedem Buch die Leihfrist
    Und Bücher, die bald fällig sind, sind hervorgehoben
    Und "Verlängern" ist nur aktiv, wenn eine Verlängerung möglich ist

  @manual
  Szenario: Verlängern im Kundenkonto
    Angenommen ich habe folgende Bücher ausgeliehen:
      | titel           | Besonderheit                   |
      | Die Verwandlung | erste Verlängerung             |
      | Heidi           | von anderer Leserin vorgemerkt |
      | Der Prozess     | bereits einmal verlängert      |
    Wenn ich bei jedem Buch auf "Verlängern" klicke
    Dann stimmt das Ergebnis mit der Besonderheit überein

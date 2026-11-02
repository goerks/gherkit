# language: de
@login
Funktionalität: Anmeldung
  Als registrierte Kundin möchte ich mich anmelden,
  damit ich meine Bestellungen sehe.

  Grundlage:
    Angenommen die Kundin "anna@example.ch" ist registriert

  Szenario: Erfolgreiche Anmeldung
    Wenn sie sich mit dem Passwort "geheim" anmeldet
    Dann sieht sie die Übersicht ihrer Bestellungen

  Szenariogrundriss: Gesperrt nach <versuche> Fehlversuchen
    Wenn sie sich <versuche> mal mit einem falschen Passwort anmeldet
    Dann ist das Konto <zustand>

    Beispiele:
      | versuche | zustand  |
      | 2        | aktiv    |
      | 3        | gesperrt |

// Beispiel-Szenarien für die Prototypen. Im echten Produkt kommen sie aus den @manual-Szenarien eines Features.
// `target` ist ein CSS-Selektor in der getesteten Web-Anwendung; im Produkt käme er aus dem Glossar
// («Vorname» → Feld). Nur Varianten D2 und D3 können damit zum Feld springen.
window.GK_SCENARIOS = [
  {
    feature: 'Leserinnen', name: 'Eine Leserin wird erfasst', testKey: 'BIB-101', tags: ['@manual', '@TEST_BIB-101'],
    steps: [
      { kw: 'Angenommen', text: 'ich bin im Bereich "Leserinnen"', target: '#bereich' },
      { kw: 'Wenn', text: 'ich den Vornamen "Anna" eingebe', target: '#vorname' },
      { kw: 'Und', text: 'ich den Nachnamen "Muster" eingebe', target: '#nachname' },
      { kw: 'Und', text: 'ich "Speichern" wähle', target: '#speichern' },
      { kw: 'Dann', text: 'sehe ich die Meldung "Leserin gespeichert"', target: '#meldung' }
    ]
  },
  {
    feature: 'Leserinnen', name: 'Eine ungültige E-Mail wird abgelehnt', testKey: 'BIB-102', tags: ['@manual', '@TEST_BIB-102'],
    steps: [
      { kw: 'Angenommen', text: 'ich bin im Bereich "Leserinnen"', target: '#bereich' },
      { kw: 'Wenn', text: 'ich die E-Mail "anna@" eingebe', target: '#email' },
      { kw: 'Und', text: 'ich "Speichern" wähle', target: '#speichern' },
      { kw: 'Dann', text: 'erhalte ich die Meldung "Bitte eine gültige E-Mail eingeben"', target: '#meldung' },
      { kw: 'Und', text: 'die Leserin steht nicht in der Liste', target: '#liste' }
    ]
  }
];

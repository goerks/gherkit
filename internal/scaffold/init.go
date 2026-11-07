package scaffold

import (
	"fmt"
	"sort"
	"strings"
)

var exampleFeatures = map[string]string{
	"en": `Feature: Example
  A first specification. Replace it with the behaviour of your system,
  or open the editor with "gherkit edit" and write one there.

  Scenario: Greeting
    Given a visitor named "Ada"
    When the visitor opens the start page
    Then the page greets "Ada"

  @manual
  Scenario: Layout on a phone
    Given the start page is open on a phone
    Then the layout is readable without zooming
`,
	"de": `# language: de
Funktionalität: Beispiel
  Eine erste Spezifikation. Ersetze sie durch das Verhalten deines Systems
  oder öffne den Editor mit "gherkit edit" und schreibe dort eine.

  Szenario: Begrüssung
    Angenommen ein Besucher namens "Ada"
    Wenn der Besucher die Startseite öffnet
    Dann begrüsst die Seite "Ada"

  @manual
  Szenario: Darstellung auf dem Handy
    Angenommen die Startseite ist auf einem Handy geöffnet
    Dann ist das Layout ohne Zoomen lesbar
`,
}

// Languages lists the languages with an example feature.
func Languages() []string {
	var l []string
	for k := range exampleFeatures {
		l = append(l, k)
	}
	sort.Strings(l)
	return l
}

// Init returns the files of a new gherkit project: an example feature in the given language.
func Init(lang string) ([]File, error) {
	if lang == "" {
		lang = "en"
	}
	src, ok := exampleFeatures[lang]
	if !ok {
		return nil, fmt.Errorf("no example feature in language %q (available: %s); write the feature in the editor instead", lang, strings.Join(Languages(), ", "))
	}
	return []File{{Path: "features/example.feature", Content: src}}, nil
}

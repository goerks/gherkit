package demorun

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	messages "github.com/cucumber/messages/go/v34"
)

// world is the state of one scenario: a tiny simulated web shop and login, enough to give the standard
// examples real steps that pass or fail depending on what the feature files say.
type world struct {
	prices   map[string]float64
	cart     map[string]int
	code     string
	order    bool
	paid     bool
	archived bool
	email    string
	message  string
	total    float64
	hasTotal bool

	customer string
	attempts int

	// library
	catalog   []book
	found     []book
	me        string
	reserved  []string       // titles reserved by the reader
	waiting   map[string]int // titles -> readers already waiting
	loans     map[string]time.Time
	held      map[string]bool // titles reserved by another reader
	loanTitle string
}

type book struct {
	title, author string
	available     int
}

const dateLayout = "02.01.2006"

type stepFn func(w *world, m []string, arg *messages.PickleStepArgument) error

type stepDef struct {
	re *regexp.Regexp
	fn stepFn
}

func def(pattern string, fn stepFn) stepDef {
	return stepDef{regexp.MustCompile("^" + pattern + "$"), fn}
}

var discounts = map[string]float64{"WELCOME": 0.10, "VIP20": 0.20}

const confirmationMail = "# Thank you for your order\n\nYour invoice is attached."

func formatCHF(v float64) string { return strconv.FormatFloat(v+0.0000001, 'f', 2, 64) }

func (w *world) computeTotal() {
	sum := 0.0
	for p, n := range w.cart {
		sum += w.prices[p] * float64(n)
	}
	w.total = sum * (1 - discounts[w.code])
	w.hasTotal = true
}

func expectEqual(what, got, want string) error {
	if got != want {
		return fmt.Errorf("%s: expected %q, got %q", what, want, got)
	}
	return nil
}

var library = []stepDef{
	// shop (English)
	def(`the product catalogue contains:`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if a == nil || a.DataTable == nil || len(a.DataTable.Rows) < 2 {
			return fmt.Errorf("a table with a header and at least one product is expected")
		}
		w.prices = map[string]float64{}
		for _, r := range a.DataTable.Rows[1:] {
			if len(r.Cells) < 2 {
				return fmt.Errorf("a row needs a product and a price")
			}
			v, err := strconv.ParseFloat(strings.TrimSpace(r.Cells[1].Value), 64)
			if err != nil {
				return fmt.Errorf("price %q is not a number", r.Cells[1].Value)
			}
			w.prices[r.Cells[0].Value] = v
		}
		return nil
	}),
	def(`a paid order`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		w.order, w.paid = true, true
		return nil
	}),
	def(`the order is confirmed`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if !w.order {
			return fmt.Errorf("there is no order to confirm")
		}
		w.email, w.archived = confirmationMail, true
		return nil
	}),
	def(`an e-mail is sent with the body:`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if a == nil || a.DocString == nil {
			return fmt.Errorf("a doc string with the expected body is expected")
		}
		if w.email == "" {
			return fmt.Errorf("no e-mail was sent")
		}
		return expectEqual("e-mail body", strings.TrimSpace(w.email), strings.TrimSpace(a.DocString.Content))
	}),
	def(`the invoice is archived`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if !w.archived {
			return fmt.Errorf("the invoice was not archived")
		}
		return nil
	}),
	def(`an empty shopping cart`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		w.cart = map[string]int{}
		return nil
	}),
	def(`the customer starts the checkout`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if len(w.cart) == 0 {
			w.message = "Your cart is empty"
			return nil
		}
		w.message = ""
		return nil
	}),
	def(`the message "([^"]*)" is shown`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		return expectEqual("message", w.message, m[1])
	}),
	def(`a shopping cart with (\d+) "([^"]*)"`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		n, _ := strconv.Atoi(m[1])
		if _, ok := w.prices[m[2]]; !ok {
			return fmt.Errorf("%q is not in the product catalogue", m[2])
		}
		w.cart = map[string]int{m[2]: n}
		return nil
	}),
	def(`the customer enters the discount code "([^"]*)"`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		w.code = strings.ToUpper(m[1])
		w.computeTotal()
		return nil
	}),
	def(`the total is ([0-9.]+) CHF`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if !w.hasTotal {
			return fmt.Errorf("no total was calculated")
		}
		return expectEqual("total", formatCHF(w.total), m[1])
	}),

	// login (German)
	def(`die Kundin "([^"]*)" ist registriert`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		w.customer = m[1]
		return nil
	}),
	def(`sie sich mit dem Passwort "([^"]*)" anmeldet`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if m[1] == "geheim" {
			w.attempts = 0
			w.message = "Übersicht"
		} else {
			w.attempts++
		}
		return nil
	}),
	def(`sieht sie die Übersicht ihrer Bestellungen`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		return expectEqual("Ansicht", w.message, "Übersicht")
	}),
	def(`sie sich (\d+) mal mit einem falschen Passwort anmeldet`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		n, _ := strconv.Atoi(m[1])
		w.attempts += n
		return nil
	}),
	def(`ist das Konto (aktiv|gesperrt)`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		state := "aktiv"
		if w.attempts >= 3 {
			state = "gesperrt"
		}
		return expectEqual("Konto", state, m[1])
	}),

	// library (German): a simulated catalogue with reservations and loans
	def(`der Katalog enthält folgende Bücher:`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if a == nil || a.DataTable == nil || len(a.DataTable.Rows) < 2 {
			return fmt.Errorf("a table with a header and at least one book is expected")
		}
		w.catalog = nil
		for _, r := range a.DataTable.Rows[1:] {
			if len(r.Cells) < 3 {
				return fmt.Errorf("a row needs title, author and availability")
			}
			n, err := strconv.Atoi(strings.TrimSpace(r.Cells[2].Value))
			if err != nil {
				return fmt.Errorf("availability %q is not a number", r.Cells[2].Value)
			}
			w.catalog = append(w.catalog, book{r.Cells[0].Value, r.Cells[1].Value, n})
		}
		return nil
	}),
	def(`die Leserin "([^"]*)" ist angemeldet`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		w.me = m[1]
		return nil
	}),
	def(`ich nach "([^"]*)" suche`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		w.found, w.message = nil, ""
		q := strings.ToLower(m[1])
		for _, b := range w.catalog {
			if strings.Contains(strings.ToLower(b.title), q) || strings.Contains(strings.ToLower(b.author), q) {
				w.found = append(w.found, b)
			}
		}
		if len(w.found) == 0 {
			w.message = "Keine Bücher gefunden"
		}
		return nil
	}),
	def(`finde ich "([^"]*)" von "([^"]*)"`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		for _, b := range w.found {
			if b.title == m[1] && b.author == m[2] {
				return nil
			}
		}
		return fmt.Errorf("%q by %q is not in the results", m[1], m[2])
	}),
	def(`es sind (\d+) Exemplare verfügbar`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if len(w.found) != 1 {
			return fmt.Errorf("expected one result, got %d", len(w.found))
		}
		return expectEqual("available copies", strconv.Itoa(w.found[0].available), m[1])
	}),
	def(`finde ich (\d+) Bücher`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		return expectEqual("number of books", strconv.Itoa(len(w.found)), m[1])
	}),
	def(`erhalte ich die Meldung "([^"]*)"`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		return expectEqual("message", w.message, m[1])
	}),
	def(`ich habe (\d+) Reservationen`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		n, _ := strconv.Atoi(m[1])
		w.reserved = nil
		for i := 0; i < n; i++ {
			w.reserved = append(w.reserved, fmt.Sprintf("Buch %d", i+1))
		}
		return nil
	}),
	def(`ich "([^"]*)" reserviere`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		var b *book
		for i := range w.catalog {
			if w.catalog[i].title == m[1] {
				b = &w.catalog[i]
			}
		}
		switch {
		case b == nil:
			return fmt.Errorf("%q is not in the catalogue", m[1])
		case b.available > 0:
			w.message = "Das Buch ist verfügbar, bitte ausleihen"
		case len(w.reserved) >= 5:
			w.message = "Maximal 5 Reservationen"
		default:
			w.reserved = append(w.reserved, m[1])
		}
		return nil
	}),
	def(`ist "([^"]*)" für mich reserviert`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		for _, t := range w.reserved {
			if t == m[1] {
				return nil
			}
		}
		return fmt.Errorf("%q is not reserved", m[1])
	}),
	def(`ich bin an Stelle (\d+) der Warteliste`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if len(w.reserved) == 0 {
			return fmt.Errorf("there is no reservation")
		}
		last := w.reserved[len(w.reserved)-1]
		return expectEqual("position", strconv.Itoa(w.waiting[last]+1), m[1])
	}),
	def(`ich habe "([^"]*)" bis zum (\d{2}\.\d{2}\.\d{4}) ausgeliehen`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		d, err := time.Parse(dateLayout, m[2])
		if err != nil {
			return err
		}
		if w.loans == nil {
			w.loans = map[string]time.Time{}
		}
		w.loans[m[1]], w.message = d, ""
		w.loanTitle = m[1]
		return nil
	}),
	def(`"([^"]*)" ist von einer anderen Leserin vorgemerkt`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		if w.held == nil {
			w.held = map[string]bool{}
		}
		w.held[m[1]] = true
		return nil
	}),
	def(`ich die Ausleihe verlängere`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		due, ok := w.loans[w.loanTitle]
		if !ok {
			return fmt.Errorf("there is no loan to extend")
		}
		if w.held[w.loanTitle] {
			w.message = "Das Buch ist vorgemerkt"
			return nil
		}
		w.loans[w.loanTitle] = due.AddDate(0, 0, 14)
		return nil
	}),
	def(`(?:ist die Leihfrist|die Leihfrist bleibt) bis zum (\d{2}\.\d{2}\.\d{4})`, func(w *world, m []string, a *messages.PickleStepArgument) error {
		due, ok := w.loans[w.loanTitle]
		if !ok {
			return fmt.Errorf("there is no loan")
		}
		return expectEqual("due date", due.Format(dateLayout), m[1])
	}),
}

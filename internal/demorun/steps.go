package demorun

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

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
}

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
}

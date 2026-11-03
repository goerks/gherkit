// Package argsplit splits a command line into arguments the way a simple shell does:
// words are separated by white space, single and double quotes group words, and a
// backslash escapes the next character inside double quotes and outside of quotes.
package argsplit

import "errors"

// ErrUnterminated is returned when a quote is not closed.
var ErrUnterminated = errors.New("unterminated quote")

// Split splits line into arguments.
func Split(line string) ([]string, error) {
	var out []string
	var cur []rune
	has := false // an empty quoted string ("") is still an argument
	var quote rune
	rs := []rune(line)
	for i := 0; i < len(rs); i++ {
		r := rs[i]
		switch {
		case quote == '\'':
			if r == '\'' {
				quote = 0
			} else {
				cur = append(cur, r)
			}
		case quote == '"':
			switch {
			case r == '"':
				quote = 0
			case r == '\\' && i+1 < len(rs) && (rs[i+1] == '"' || rs[i+1] == '\\'):
				i++
				cur = append(cur, rs[i])
			default:
				cur = append(cur, r)
			}
		case r == '\'' || r == '"':
			quote, has = r, true
		case r == '\\' && i+1 < len(rs):
			i++
			cur, has = append(cur, rs[i]), true
		case r == ' ' || r == '\t' || r == '\n' || r == '\r':
			if has || len(cur) > 0 {
				out = append(out, string(cur))
				cur, has = nil, false
			}
		default:
			cur, has = append(cur, r), true
		}
	}
	if quote != 0 {
		return nil, ErrUnterminated
	}
	if has || len(cur) > 0 {
		out = append(out, string(cur))
	}
	return out, nil
}

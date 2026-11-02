@cli @lint
Feature: Linting
  `gherkit lint` finds syntax errors with the official parser and checks
  rules that make specifications easier to read and maintain.

  Rule: Every finding names file, line, severity and rule

    Scenario Outline: The rule <rule> finds its problem
      Given a file "case.feature" with:
        """gherkin
        <content>
        """
      When I run "gherkit lint ."
      Then the output contains "<rule>"
      And the output contains "case.feature:<line>:"

      Examples:
        | rule                | line | content                                                                                               |
        | syntax              | 5    | Feature: F\n  Scenario: S\n    Given x\n      \| a \|\n      \| 1 \| 2 \|                             |
        | no-steps            | 3    | Feature: F\n\n  Scenario: Empty                                                                       |
        | duplicate-scenario  | 6    | Feature: F\n\n  Scenario: S\n    Given x\n\n  Scenario: S\n    Given y                                |
        | outline-placeholder | 4    | Feature: F\n\n  Scenario Outline: O\n    Given <a> <b>\n\n    Examples:\n      \| a \|\n      \| 1 \| |

  Rule: The exit code tells CI whether to fail

    Scenario: Errors fail the build
      Given a file "bad.feature" with:
        """gherkin
        Feature: Bad
          Scenario: S
            Given x
              | a |
              | 1 | 2 |
        """
      When I run "gherkit lint ."
      Then the exit code is 2

    Scenario: Warnings only fail in strict mode
      Given a file "warn.feature" with:
        """gherkin
        Feature: Warn

          Scenario: Without steps
        """
      When I run "gherkit lint ."
      Then the exit code is 0
      When I run "gherkit lint --strict ."
      Then the exit code is 2

    Scenario: GitHub annotations for pull requests
      Given a file "bad.feature" with:
        """gherkin
        Feature: Bad

          Scenario: S
        """
      When I run "gherkit lint -o github ."
      Then the output contains "::warning file=bad.feature,line=3"

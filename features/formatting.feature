@cli @fmt
Feature: Formatting
  `gherkit fmt` brings every .feature file into one canonical layout.
  Formatting must never change the meaning of a specification:
  the compiled test cases (pickles) stay exactly the same.

  Scenario: An unformatted file is reported by --check
    Given a file "messy.feature" with:
      """gherkin
      Feature:    Messy
      Scenario:   Somewhere
      Given    a step
      """
    When I run "gherkit fmt --check ."
    Then the exit code is 2
    And the output contains "messy.feature"

  Scenario: Formatting rewrites the file in canonical layout
    Given a file "messy.feature" with:
      """gherkin
      Feature:    Messy
      Scenario:   Somewhere
      Given    a step
        |a|bb|
      """
    When I run "gherkit fmt ."
    Then the exit code is 0
    And the file "messy.feature" contains:
      """gherkin
      Feature: Messy

        Scenario: Somewhere
          Given a step
            | a | bb |
      """

  Scenario Outline: Formatting keeps the meaning of the official example "<example>"
    Given the official Gherkin example "<example>"
    When I run "gherkit fmt ."
    Then the exit code is 0
    And the file still yields the same test cases

    Examples:
      | example                                   |
      | complex_background.feature                |
      | docstrings.feature                        |
      | escaped_pipes.feature                     |
      | i18n_fr.feature                           |
      | rule.feature                              |
      | scenario_outline.feature                  |
      | step_with_datatable_and_docstring.feature |
      | tags.feature                              |

  Scenario: A file with syntax errors is left untouched
    Given a file "broken.feature" with:
      """gherkin
      Feature: Broken
        Scenario: S
          Given a table
            | a | b |
            | 1 |
      """
    When I run "gherkit fmt ."
    Then the exit code is 0
    And the error output contains "syntax error"
    And the file "broken.feature" is unchanged

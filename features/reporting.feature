@cli @report
Feature: Reporting
  `gherkit report` turns Cucumber JSON results into a readable report.
  The layout is a Go template that projects can replace.

  Background:
    Given a Cucumber JSON result with 2 passed and 1 failed scenario

  Scenario: HTML report with summary
    When I run "gherkit report results.json -o report.html"
    Then the exit code is 0
    And the file "report.html" contains "2 / 3"
    And the error output contains "3 scenario(s): 2 passed, 1 failed"

  Scenario: The build fails when a scenario failed
    When I run "gherkit report results.json -o report.html --fail-on-failed"
    Then the exit code is 1

  Scenario: Report in German
    When I run "gherkit report results.json -f md --lang de"
    Then the output contains "Abnahmetest-Report"
    And the output contains "fehlgeschlagen"

  Scenario: Custom template
    Given a file "summary.tmpl" with:
      """
      {{.Summary.Scenarios.Passed}} of {{.Summary.Scenarios.Total}} ok
      """
    When I run "gherkit report results.json -t summary.tmpl"
    Then the output contains "2 of 3 ok"

@cli @run
Feature: Running
  `gherkit run` starts the test runner of the project, reads the Cucumber JSON
  it writes and reports the result. gherkit does not execute step code itself.
  The runner is a command that writes its results to {output}.

  Background:
    Given a Cucumber JSON result with 2 passed and 1 failed scenario

  Rule: The results are summarised and can fail the build

    Scenario: A failed scenario fails the build
      When I run "gherkit run --cmd \"cp results.json {output}\" --report report.html"
      Then the exit code is 1
      And the error output contains "3 scenario(s): 2 passed, 1 failed"
      And the file "report.html" contains "2 / 3"

    Scenario: The results can be reported without failing the build
      When I run "gherkit run --cmd \"cp results.json {output}\" --fail-on-failed=false"
      Then the exit code is 0

    Scenario: The Cucumber JSON can be kept
      When I run "gherkit run --cmd \"cp results.json {output}\" -o kept/out.json --fail-on-failed=false"
      Then the file "kept/out.json" contains "bad 0"

  Rule: Problems with the runner are reported clearly

    Scenario: A failing runner without results fails the build
      When I run "gherkit run --cmd false"
      Then the exit code is 1
      And the error output contains "wrote no results"

    Scenario: A runner that writes nothing is a configuration error
      When I run "gherkit run --cmd true"
      Then the exit code is 3
      And the error output contains "wrote no results"

    Scenario: Without a command the adapter is detected from the project
      When I run "gherkit run"
      Then the exit code is 3
      And the error output contains "no adapter detected"

    Scenario: An unknown adapter is rejected
      When I run "gherkit run --adapter cobol"
      Then the exit code is 3
      And the error output contains "unknown adapter"

@cli @run @manual-testing
Feature: Manual scenarios
  Some scenarios are tested by people, not by a runner: third-party services
  behind captchas, volatile data, visual judgement. Such scenarios carry the
  tag @manual. `gherkit run` keeps them away from the automated runner, so
  that they can be executed and reported separately.

  Background:
    Given a Cucumber JSON result with 2 passed and 1 failed scenario

  Rule: Automated runs exclude manual scenarios

    Scenario: Manual scenarios are excluded by default
      When I run "gherkit run --cmd \"cp results.json {output}; echo {tags} > tags.txt\" --fail-on-failed=false"
      Then the file "tags.txt" contains "not @manual"

    Scenario: The tag expression can be changed
      When I run "gherkit run --cmd \"cp results.json {output}; echo {tags} > tags.txt\" --tags @smoke --fail-on-failed=false"
      Then the file "tags.txt" contains "@smoke"
      And the file "tags.txt" does not contain "not @manual"

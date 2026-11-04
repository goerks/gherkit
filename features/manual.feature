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

  Rule: A manual run records what a person observed and exports Cucumber JSON

    Background:
      Given a file "prices.feature" with:
        """
        Feature: Price comparison

          @manual
          Scenario: Offers are sorted by price
            Given I have solved the captcha
            When I search for a health insurance
            Then the offers are sorted ascending

          Scenario: The API answers
            Then the API answers with offers
        """
      And the editor is running in the current folder

    Scenario: Only test cases tagged @manual are part of the run
      When I start a manual run as "Anna" for the tag "@manual"
      Then the response contains "Offers are sorted by price"
      And the response does not contain "The API answers"

    Scenario: A run needs a tester
      When I start a manual run as "" for the tag "@manual"
      Then the editor refuses the request with "tester is required"

    Scenario: A run without matching test cases is refused
      When I start a manual run as "Anna" for the tag "@nightly"
      Then the editor refuses the request with "no test cases found"

    Scenario: A failed manual step fails the build and shows up in the report
      Given I start a manual run as "Anna" for the tag "@manual"
      And I record "passed" with the comment "" for step 1 of test case 1
      And I record "failed" with the comment "sorted descending" for step 2 of test case 1
      And I finish the manual run and keep the result as "manual.json"
      When I run "gherkit run --cmd \"cp manual.json {output}\" --report report.md"
      Then the exit code is 1
      And the error output contains "1 scenario(s): 0 passed, 1 failed"
      And the file "report.md" contains "sorted descending"
      And the file "report.md" contains "Tester: Anna"

    Scenario: Steps after a failed step are skipped
      Given I start a manual run as "Anna" for the tag "@manual"
      And I record "failed" with the comment "wrong order" for step 2 of test case 1
      And I finish the manual run and keep the result as "manual.json"
      Then the file "manual.json" contains "skipped"

    Scenario: A file with syntax errors is left out of a run over the whole folder
      Given a file "broken.feature" with:
        """
        Feature: Broken
          Scenario: Table with a missing cell
            Given a table
              | a | b |
              | c |
        """
      When I start a manual run as "Anna" for the tag "@manual"
      Then the response contains "Offers are sorted by price"
      And the response contains "broken.feature has syntax errors"

  Rule: Failing or ignoring a step needs a reason

    Background:
      Given a file "prices.feature" with:
        """
        Feature: Price comparison

          @manual @TEST_LIB-7
          Scenario: Offers are sorted by price
            Given I have solved the captcha
            When I search for a health insurance
            Then the offers are sorted ascending
        """
      And the editor is running in the current folder
      And I start a manual run as "Anna" for the tag "@manual"

    Scenario: A failed step without a reason is refused
      When I try to record "failed" with the comment "" for step 3 of test case 1
      Then the editor refuses the request with "reason is required"

    Scenario: An ignored step without a reason is refused
      When I try to record "ignored" with the comment "" for step 1 of test case 1
      Then the editor refuses the request with "reason is required"

    Scenario: An ignored step is exported as skipped together with its reason
      Given I record "ignored" with the comment "test system is down" for step 1 of test case 1
      And I finish the manual run and keep the result as "manual.json"
      Then the file "manual.json" contains "test system is down"
      And the file "manual.json" contains "ignored"

    Scenario: A failed step becomes the text of a Jira bug
      Given I record "failed" with the comment "sorted descending" for step 3 of test case 1
      When I ask for the Jira text of test case 1
      Then the response contains "sorted descending"
      And the response contains "prices.feature"
      And the response contains "LIB-7"

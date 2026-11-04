@e2e @editor
Feature: Manual testing in the editor
  A tester performs the @manual scenarios of the library example in the editor,
  guided feature by feature, scenario by scenario and step by step. These
  scenarios drive the Run tab in a real browser and cover every point of it.

  Background:
    Given the editor is open on a copy of the examples
    And I open the Run tab

  Rule: A run starts with the right test cases

    Scenario: A run needs a tester
      When I start a run without a tester
      Then I see the error "Please enter the tester."

    Scenario: By default a run holds the manual test cases of all features
      When I start a run as "Anna"
      Then the navigation lists 6 test cases in 3 features
      And "shop/broken.feature" is named as left out
      And I am at scenario 1 of 2 in feature 1 of 3
      And I am at step 1 of 6

    Scenario: One feature can be tested with all its test cases
      When I choose the scope "All test cases"
      And I choose the features "Current feature"
      And I start a run as "Anna"
      Then the navigation lists 5 test cases in 1 feature

    Scenario: A run without matching test cases is refused
      When I select the feature file "de/anmeldung.feature"
      And I choose the features "Current feature"
      And I start a run as "Anna"
      Then I see the error "no test cases found with the tag @manual"

  Rule: The run guides the tester step by step

    Scenario: Good moves on to the next step
      When I start a run as "Anna"
      And I say good
      Then I am at step 2 of 6
      And the progress shows 1 step done

    Scenario: Test information can be added to a step that went well
      When I start a run as "Anna"
      And I write "device: Pixel 7" as the comment
      And I say good
      Then the earlier step 1 shows the note "device: Pixel 7"
      And I am at step 2 of 6

    Scenario: Bad needs a reason
      When I start a run as "Anna"
      And I say bad
      Then saving is not possible without a reason
      When I cancel
      Then the progress shows 0 steps done
      And I am at step 1 of 6

    Scenario: A failed step ends the scenario
      When I start a run as "Anna"
      And I say good 4 times
      And I say bad with the reason "return date is missing"
      Then test case 1 is marked as "failed"
      And I am at scenario 2 of 2 in feature 1 of 3
      And the progress shows 6 steps done

    Scenario: Ignoring needs a reason and ends the scenario
      When I start a run as "Anna"
      And I say ignore
      Then saving is not possible without a reason
      When I write "test system is down" as the reason
      And I confirm
      Then test case 1 is marked as "ignored"
      And the progress shows 6 steps done

    Scenario: A step can be changed afterwards
      When I start a run as "Anna"
      And I say good 3 times
      And I change step 2
      Then I am at step 2 of 6
      When I say bad with the reason "wrong search result"
      Then test case 1 is marked as "failed"

    Scenario: Any scenario can be reached through the navigation
      When I start a run as "Anna"
      And I go to test case 4 in the navigation
      Then I am at scenario 2 of 2 in feature 2 of 3

  Rule: Evidence belongs to the step

    Scenario: Evidence is attached in the step
      When I start a run as "Anna"
      And I say bad
      And I write "return date is missing" as the reason
      And I attach the evidence file "trefferliste.png"
      Then the step shows the evidence "trefferliste.png"
      And the comment still reads "return date is missing"
      When I confirm
      Then the evidence file "trefferliste.png" is stored with the run

    Scenario: A screenshot can be pasted
      When I start a run as "Anna"
      And I say bad
      And I paste a screenshot into the comment
      Then the step shows an evidence image

  Rule: The results are summarised

    Scenario: The results list failures and ignored steps with their reasons
      When I start a run as "Anna"
      And I say bad with the reason "return date is missing"
      And I say ignore with the reason "test system is down"
      And I open the results
      Then the results show 1 failed, 1 ignored and 4 open
      And test case 1 is listed with the reason "return date is missing"
      And test case 2 is listed with the reason "test system is down"

    Scenario: A failed test becomes the text of a Jira bug
      When I start a run as "Anna"
      And I say good
      And I say bad with the reason "return date is missing"
      And I open the results
      And I open the Jira text for test case 1
      Then the Jira summary starts with "[Test failed]"
      And the Jira description contains "return date is missing"
      And the Jira description contains "katalogsuche.feature"
      And the Jira description contains "gerät=Computer, suchbegriff=Kafka"
      And the Jira dialog names the Xray test "BIB-101"
      When I close the Jira dialog

  Rule: A run can be interrupted and resumed

    Scenario: A run continues where it stopped
      When I start a run as "Anna"
      And I say good 2 times
      And I reload the editor
      And I resume the run
      Then I am at step 3 of 6
      And the progress shows 2 steps done

  Rule: A finished run is exported as Cucumber JSON

    Scenario: A finished run is read-only and exported with every answer
      When I start a run as "Anna"
      And I say good
      And I write "device: Pixel 7" as the comment
      And I say good
      And I say bad with the reason "return date is missing"
      And I finish the run and confirm that steps remain open
      Then the run is read-only
      And the banner names the exported file "cucumber.json"
      And test case 1 is exported as a manual test by "Anna"
      And step 1 of test case 1 is exported as "passed"
      And step 2 of test case 1 is exported with the comment "device: Pixel 7"
      And step 3 of test case 1 is exported as "failed" with the reason "return date is missing"
      And step 4 of test case 1 is exported as "skipped"
      And step 1 of test case 3 is exported as "undefined"
      When I go back to all runs
      Then the run is listed as "finished"

    Scenario: An ignored step is exported as skipped together with its reason
      When I start a run as "Anna"
      And I say ignore with the reason "test system is down"
      And I finish the run and confirm that steps remain open
      Then step 1 of test case 1 is exported as ignored with the reason "test system is down"

    Scenario: The report shows who tested and why a step failed
      When I start a run as "Anna"
      And I say bad with the reason "return date is missing"
      And I finish the run and confirm that steps remain open
      And I open the report
      Then the report contains "Anna"
      And the report contains "return date is missing"

    Scenario: A failed manual step fails the build
      When I start a run as "Anna"
      And I say bad with the reason "return date is missing"
      And I finish the run and confirm that steps remain open
      And I run gherkit with the exported result as the test results
      Then the exit code is 1
      And the error output contains "1 failed"

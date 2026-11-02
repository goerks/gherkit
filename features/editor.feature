@editor
Feature: Browser editor
  `gherkit edit` starts a local editor for a folder of .feature files.
  The folder can be switched while the editor is running.

  Background:
    Given a file "shop/cart.feature" with:
      """gherkin
      Feature: Cart

        Scenario: Add an item
          Given an empty cart
          When I add "Pen"
          Then the cart contains 1 item
      """
    And the editor is running in the current folder

  Scenario: The editor lists the features of the folder
    When I request "GET /api/workspace"
    Then the response contains "shop/cart.feature"

  Scenario: The editor offers all editing variants
    When I request "GET /"
    Then the response contains "data-variant=\"code\""
    And the response contains "data-variant=\"doc\""
    And the response contains "data-variant=\"struct\""
    And the response contains "data-variant=\"split\""

  Scenario: A feature can be saved from the editor
    When I save "shop/new.feature" with "Feature: New\n" through the editor
    Then the file "shop/new.feature" contains:
      """
      Feature: New
      """

  Scenario: Another folder can be opened later
    Given a file "other/x.feature" with:
      """gherkin
      Feature: X
      """
    When I open the folder "other" in the editor
    And I request "GET /api/workspace"
    Then the response contains "x.feature"
    And the response does not contain "cart.feature"

  Scenario: Steps used in the folder feed the completion
    When I request "GET /api/steps"
    Then the response contains "an empty cart"

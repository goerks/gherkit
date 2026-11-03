Feature: Greeting
  A tiny example for the gherkit Java adapter (Cucumber-JVM, Maven).

  Scenario: A person is greeted by name
    Given a person named "Anna"
    When the person is greeted
    Then the greeting is "Hello, Anna!"

  Scenario Outline: Several people are greeted
    Given a person named "<name>"
    When the person is greeted
    Then the greeting is "Hello, <name>!"

    Examples:
      | name   |
      | Ben    |
      | Chiara |

  @fails
  Scenario: A wrong expectation fails on purpose
    Given a person named "Dora"
    When the person is greeted
    Then the greeting is "Goodbye, Dora!"

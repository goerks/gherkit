Feature: Broken on purpose
  This file shows how syntax errors look in the editor.

  Scenario: Missing pipe
    Given a table:
      | a | b |
      | 1 |
    Then nothing else

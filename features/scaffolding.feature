@cli @init @ci
Feature: Setting up a project
  `gherkit init` prepares a folder with an example feature, `gherkit ci`
  writes a pipeline that checks, runs and reports the specifications.
  Existing files are never overwritten by accident.

  Rule: init creates a first feature

    Scenario: An empty folder gets an example
      When I run "gherkit init"
      Then the exit code is 0
      And the output contains "created"
      And the file "features/example.feature" contains "Scenario: Greeting"

    Scenario: The example can be German
      When I run "gherkit init --lang de"
      Then the file "features/example.feature" contains "Funktionalität: Beispiel"

    Scenario: A folder with specifications keeps them
      Given a file "shop.feature" with:
        """
        Feature: Shop
        """
      When I run "gherkit init"
      Then the exit code is 0
      And the error output contains "no example is written"
      And the file "features/example.feature" does not exist

    Scenario: Nothing is written in a dry run
      When I run "gherkit init --dry-run"
      Then the output contains "dry run"
      And the file "features/example.feature" does not exist

  Rule: ci writes a pipeline

    Scenario: GitHub Actions is the default
      When I run "gherkit ci"
      Then the exit code is 0
      And the file ".github/workflows/gherkit.yml" contains "gherkit lint --strict"

    Scenario: Other CI systems are supported
      When I run "gherkit ci --provider azure"
      Then the file "azure-pipelines.yml" contains "gherkit fmt --check"

    Scenario: A pipeline can be printed instead of written
      When I run "gherkit ci -o -"
      Then the output contains "gherkit fmt --check"

    Scenario: An existing pipeline is not replaced
      Given a file ".github/workflows/gherkit.yml" with:
        """
        # mine
        """
      When I run "gherkit ci"
      Then the exit code is 3
      And the error output contains "use --force"
      And the file ".github/workflows/gherkit.yml" contains "# mine"

    Scenario: An unknown CI system is a usage error
      When I run "gherkit ci --provider jenkins"
      Then the exit code is 3
      And the error output contains "unknown CI provider"

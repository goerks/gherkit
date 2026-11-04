# Java runner example

A minimal Cucumber-JVM project (Maven, JUnit Platform) that shows how `gherkit run` drives a Java runner.

```sh
gherkit run --adapter java --dir runner-examples/java --report build/report.html
```

The Java adapter runs `mvn -B -ntp test` (or the Maven/Gradle wrapper of the project) and tells Cucumber-JVM where
to write its results with `-Dcucumber.plugin=json:<file>` (through `JAVA_TOOL_OPTIONS`). The scenario tagged `@fails`
fails on purpose and is skipped (the project sets `cucumber.filter.tags=not @fails`; gherkit adds
`not @manual` to it). Run it with `gherkit run --adapter java --dir runner-examples/java --tags @fails`: an explicit
`--tags` replaces the filter of the project.

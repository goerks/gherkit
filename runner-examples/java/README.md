# Java runner example

A minimal Cucumber-JVM project (Maven, JUnit Platform) that shows how `gherkit run` drives a Java runner.

```sh
gherkit run --adapter java --dir runner-examples/java --report build/report.html
```

The Java adapter runs `mvn -B -ntp test` (or the Maven/Gradle wrapper of the project) and tells Cucumber-JVM where
to write its results through the environment variable `CUCUMBER_PLUGIN=json:<file>`. The scenario tagged `@fails`
fails on purpose and is skipped unless you run it with `-e CUCUMBER_FILTER_TAGS=@fails`.
